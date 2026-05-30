struct RenderParams {
    viewProj: mat4x4<f32>,
    u_particleSize: f32,
    u_colorTheme: f32,
    screenAspectRatio: f32,
    padding: f32,
};

@group(0) @binding(0) var<storage, read> positions: array<vec4<f32>>;
@group(0) @binding(1) var<uniform> rParams: RenderParams;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) speed: f32,
};

@vertex
fn vs_main(
    @builtin(instance_index) instanceIdx: u32,
    @builtin(vertex_index) vertexIdx: u32
) -> VertexOutput {
    // Quad vertices offsets for 2 triangles
    var offsets = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>( 1.0,  1.0)
    );

    // Quad UVs
    var uvs = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(1.0, 1.0)
    );

    let localIdx = vertexIdx % 6u;
    let offset = offsets[localIdx];
    let uv = uvs[localIdx];

    // Read particle position and speed (W component) from positions storage buffer
    let pData = positions[instanceIdx];
    let pPos = pData.xyz;
    let speed = pData.w;

    // Project center of particle to clip space
    let centerClip = rParams.viewProj * vec4<f32>(pPos, 1.0);

    // Compute clip-space offset. Aspect ratio correction is critical to prevent ellipses.
    // Dividing this by w in hardware will automatically scale size relative to distance.
    let size = rParams.u_particleSize * 0.25;
    let clipOffset = offset * size * vec2<f32>(1.0 / rParams.screenAspectRatio, 1.0);

    var out: VertexOutput;
    // Add offset directly to projected coordinates.
    // This allows natural perspective scaling with distance.
    out.position = centerClip + vec4<f32>(clipOffset, 0.0, 0.0);
    out.uv = uv;
    out.speed = speed;

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let uv = in.uv;
    
    // Circular distance from billboard center
    let dist = length(uv - vec2<f32>(0.5));
    if (dist > 0.5) {
        discard;
    }

    // Smooth glow shape with exponential center-intensity falloff
    let glow = 1.0 - smoothstep(0.0, 0.5, dist);
    let intensity = pow(glow, 2.0);

    // Normalize particle speed to [0, 1] relative to expected maximum of 20
    let normSpeed = clamp(in.speed / 20.0, 0.0, 1.0);

    // Interactive multi-theme color palettes based on speed
    var colorBlue = vec3<f32>(0.05, 0.2, 1.0);
    var colorCyan = vec3<f32>(0.0, 0.95, 1.0);
    var colorPink = vec3<f32>(1.0, 0.05, 0.7);

    // Custom Theme color selections based on the UI
    if (rParams.u_colorTheme == 1.0) {
        // Theme A: Organic Aurora (Emerald, Lime, Aqua)
        colorBlue = vec3<f32>(0.05, 0.7, 0.4);
        colorCyan = vec3<f32>(0.0, 0.9, 0.95);
        colorPink = vec3<f32>(0.7, 1.0, 0.1);
    } else if (rParams.u_colorTheme == 2.0) {
        // Theme B: Cosmic Fire (Deep Orange, Amber, Golden Violet)
        colorBlue = vec3<f32>(0.6, 0.05, 0.9);
        colorCyan = vec3<f32>(1.0, 0.25, 0.0);
        colorPink = vec3<f32>(1.0, 0.8, 0.1);
    }

    var baseColor = vec3<f32>(0.0);
    if (normSpeed < 0.4) {
        // Interpolate slow speed
        let t = normSpeed / 0.4;
        baseColor = mix(colorBlue, colorCyan, t);
    } else {
        // Interpolate high speed
        let t = (normSpeed - 0.4) / 0.6;
        baseColor = mix(colorCyan, colorPink, t);
    }

    // Fast-moving particles emit massive neon glowing brightness (non-linear boost)
    let emissiveBoost = 1.0 + pow(normSpeed, 2.5) * 5.0;
    let finalRGB = baseColor * intensity * emissiveBoost;
    let finalAlpha = intensity * (0.85 + normSpeed * 0.15); // Faster particles are slightly denser

    return vec4<f32>(finalRGB, finalAlpha);
}
