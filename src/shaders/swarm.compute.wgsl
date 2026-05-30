struct SimParams {
    u_mouse: vec3<f32>,
    u_time: f32,
    u_deltaTime: f32,
    u_noiseFreq: f32,
    u_noiseSpeed: f32,
    u_noiseStrength: f32,
    u_mouseRadius: f32,
    u_mouseStrength: f32,
    u_gravity: f32,
    u_particleSize: f32,
    u_colorTheme: f32,
    padding1: f32,
    padding2: f32,
    padding3: f32,
};

@group(0) @binding(0) var<storage, read_write> positions: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> velocities: array<vec4<f32>>;
@group(0) @binding(2) var<uniform> params: SimParams;

// 3D Value Noise helpers (standard GLSL-to-WGSL port, WTFPL/MIT License)
fn mod289(x: vec4<f32>) -> vec4<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn perm4(x: vec4<f32>) -> vec4<f32> {
    return mod289(((x * 34.0) + 1.0) * x);
}

// Pseudo-random hash based on sine
fn rand33(p: vec3<f32>) -> vec3<f32> {
    let s = vec3<f32>(
        fract(sin(dot(p, vec3<f32>(127.1, 311.7, 74.7))) * 43758.5453123),
        fract(sin(dot(p, vec3<f32>(269.5, 183.3, 246.1))) * 43758.5453123),
        fract(sin(dot(p, vec3<f32>(419.2, 371.9, 93.3))) * 43758.5453123)
    );
    return s;
}

fn noise3(p: vec3<f32>) -> f32 {
    let a = floor(p);
    var d: vec3<f32> = p - a;
    d = d * d * (3.0 - 2.0 * d);

    let b = a.xxyy + vec4<f32>(0.0, 1.0, 0.0, 1.0);
    let k1 = perm4(b.xyxy);
    let k2 = perm4(k1.xyxy + b.zzww);

    let c = k2 + a.zzzz;
    let k3 = perm4(c);
    let k4 = perm4(c + 1.0);

    let o1 = fract(k3 * (1.0 / 41.0));
    let o2 = fract(k4 * (1.0 / 41.0));

    let o3 = o2 * d.z + o1 * (1.0 - d.z);
    let o4 = o3.yw * d.x + o3.xz * (1.0 - d.x);

    return o4.y * d.y + o4.x * (1.0 - d.y);
}

// Evaluate 3 independent value noise fields to get a 3D vector potential field
fn snoiseVec3(p: vec3<f32>) -> vec3<f32> {
    let n1 = noise3(p);
    let n2 = noise3(p + vec3<f32>(31.415, 59.265, 27.182));
    let n3 = noise3(p + vec3<f32>(14.142, 17.320, 22.360));
    return vec3<f32>(n1, n2, n3) * 2.0 - vec3<f32>(1.0);
}

// Calculate the curl of the vector potential field using finite differences
// curl(A) = (dAz/dy - dAy/dz, dAx/dz - dAz/dx, dAy/dx - dAx/dy)
fn curlNoise(p: vec3<f32>) -> vec3<f32> {
    let e = 0.02;
    let dx = vec3<f32>(e, 0.0, 0.0);
    let dy = vec3<f32>(0.0, e, 0.0);
    let dz = vec3<f32>(0.0, 0.0, e);

    let p_x0 = snoiseVec3(p - dx);
    let p_x1 = snoiseVec3(p + dx);
    let p_y0 = snoiseVec3(p - dy);
    let p_y1 = snoiseVec3(p + dy);
    let p_z0 = snoiseVec3(p - dz);
    let p_z1 = snoiseVec3(p + dz);

    let cx = (p_y1.z - p_y0.z) - (p_z1.y - p_z0.y);
    let cy = (p_z1.x - p_z0.x) - (p_x1.z - p_x0.z);
    let cz = (p_x1.y - p_x0.y) - (p_y1.x - p_y0.x);

    return vec3<f32>(cx, cy, cz) / (2.0 * e);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let PARTICLE_COUNT: u32 = 100000u;
    if (index >= PARTICLE_COUNT) {
        return;
    }

    // Read current physical properties
    let pos = positions[index];
    let vel = velocities[index];

    let p_pos = pos.xyz;
    let p_vel = vel.xyz;

    // 1. Curl Noise Force (computes divergence-free fluid field)
    let noiseCoord = p_pos * params.u_noiseFreq + vec3<f32>(0.0, 0.0, params.u_time * params.u_noiseSpeed);
    let curlForce = curlNoise(noiseCoord) * params.u_noiseStrength;

    // 2. Gravitational Attraction Force to Center (0,0,0)
    let distToCenter = length(p_pos);
    var gravityForce = vec3<f32>(0.0);
    if (distToCenter > 0.001) {
        // Linear attraction that gets stronger with distance to avoid particles flying off
        gravityForce = -normalize(p_pos) * pow(distToCenter, 1.2) * params.u_gravity;
    }

    // 3. Mouse Repulsion Force
    let toParticle = p_pos - params.u_mouse;
    let distToMouse = length(toParticle);
    var repulsionForce = vec3<f32>(0.0);
    
    if (distToMouse < params.u_mouseRadius && distToMouse > 0.001) {
        let normalizedToParticle = normalize(toParticle);
        // Smooth exponential decay based on distance, creating a high-fidelity pressure field
        let forceFactor = 1.0 - (distToMouse / params.u_mouseRadius);
        repulsionForce = normalizedToParticle * pow(forceFactor, 2.0) * params.u_mouseStrength;
    }

    // 4. Update velocity (Newtonian integration with damping)
    let acceleration = curlForce + gravityForce + repulsionForce;
    var newVel = p_vel + acceleration * params.u_deltaTime;
    
    // Apply a soft fluid drag
    newVel *= 0.97;

    // Cap the maximum velocity to prevent numeric explosions
    let maxSpeed = 22.0;
    let speed = length(newVel);
    if (speed > maxSpeed) {
        newVel = (newVel / speed) * maxSpeed;
    }

    // 5. Update position
    var newPos = p_pos + newVel * params.u_deltaTime;

    // 6. Spherical Constraint Boundary
    let boundaryRadius = 24.0;
    let distFromOrigin = length(newPos);
    if (distFromOrigin > boundaryRadius) {
        newPos = (newPos / distFromOrigin) * boundaryRadius;
        // Bounce off with loss of velocity
        newVel = reflect(newVel, -normalize(newPos)) * 0.4;
    }

    // Write back position and velocity (retaining alignment elements)
    positions[index] = vec4<f32>(newPos, speed); // Store speed in W for fragment color brightness!
    velocities[index] = vec4<f32>(newVel, 0.0);
}
