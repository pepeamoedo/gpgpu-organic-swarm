import computeShaderCode from '../shaders/swarm.compute.wgsl?raw';
import renderShaderCode from '../shaders/swarm.render.wgsl?raw';

// Custom lightweight 3D Matrix Math Utility to avoid external library dependencies (gl-matrix)
const Math3D = {
    createMat4() {
        return new Float32Array(16);
    },

    identityMat4(out) {
        out.fill(0);
        out[0] = 1;
        out[5] = 1;
        out[10] = 1;
        out[15] = 1;
        return out;
    },

    perspectiveMat4(out, fovy, aspect, near, far) {
        const f = 1.0 / Math.tan(fovy / 2.0);
        out.fill(0);
        out[0] = f / aspect;
        out[5] = f;
        out[10] = far / (near - far);
        out[11] = -1.0;
        out[14] = (far * near) / (near - far);
        return out;
    },

    lookAtMat4(out, eye, center, up) {
        const eyex = eye[0], eyey = eye[1], eyez = eye[2];
        const upx = up[0], upy = up[1], upz = up[2];
        const centerx = center[0], centery = center[1], centerz = center[2];

        let z0 = eyex - centerx;
        let z1 = eyey - centery;
        let z2 = eyez - centerz;
        let len = Math.hypot(z0, z1, z2);
        if (len > 0) {
            len = 1 / len; z0 *= len; z1 *= len; z2 *= len;
        }

        let x0 = upy * z2 - upz * z1;
        let x1 = upz * z0 - upx * z2;
        let x2 = upx * z1 - upy * z0;
        len = Math.hypot(x0, x1, x2);
        if (len > 0) {
            len = 1 / len; x0 *= len; x1 *= len; x2 *= len;
        }

        let y0 = z1 * x2 - z2 * x1;
        let y1 = z2 * x0 - z0 * x2;
        let y2 = z0 * x1 - z1 * x0;
        len = Math.hypot(y0, y1, y2);
        if (len > 0) {
            len = 1 / len; y0 *= len; y1 *= len; y2 *= len;
        }

        out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
        out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
        out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
        out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
        out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
        out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
        out[15] = 1;
        return out;
    },

    multiplyMat4(out, a, b) {
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

        const b00 = b[0], b01 = b[1], b02 = b[2], b03 = b[3];
        const b10 = b[4], b11 = b[5], b12 = b[6], b13 = b[7];
        const b20 = b[8], b21 = b[9], b22 = b[10], b23 = b[11];
        const b30 = b[12], b31 = b[13], b32 = b[14], b33 = b[15];

        out[0] = b00 * a00 + b01 * a10 + b02 * a20 + b03 * a30;
        out[1] = b00 * a01 + b01 * a11 + b02 * a21 + b03 * a31;
        out[2] = b00 * a02 + b01 * a12 + b02 * a22 + b03 * a32;
        out[3] = b00 * a03 + b01 * a13 + b02 * a23 + b03 * a33;

        out[4] = b10 * a00 + b11 * a10 + b12 * a20 + b13 * a30;
        out[5] = b10 * a01 + b11 * a11 + b12 * a21 + b13 * a31;
        out[6] = b10 * a02 + b11 * a12 + b12 * a22 + b13 * a32;
        out[7] = b10 * a03 + b11 * a13 + b12 * a23 + b13 * a33;

        out[8] = b20 * a00 + b21 * a10 + b22 * a20 + b23 * a30;
        out[9] = b20 * a01 + b21 * a11 + b22 * a21 + b23 * a31;
        out[10] = b20 * a02 + b21 * a12 + b22 * a22 + b23 * a32;
        out[11] = b20 * a03 + b21 * a13 + b22 * a23 + b23 * a33;

        out[12] = b30 * a00 + b31 * a10 + b32 * a20 + b33 * a30;
        out[13] = b30 * a01 + b31 * a11 + b32 * a21 + b33 * a31;
        out[14] = b30 * a02 + b31 * a12 + b32 * a22 + b33 * a32;
        out[15] = b30 * a03 + b31 * a13 + b32 * a23 + b33 * a33;
        return out;
    }
};

export class PhaseSwarm {
    constructor(canvas) {
        this.canvas = canvas;
        this.PARTICLE_COUNT = 100000;
        
        // Simulation parameter controls defaults
        this.controls = {
            noiseFreq: 0.12,
            noiseSpeed: 0.35,
            noiseStrength: 7.5,
            mouseRadius: 7.0,
            mouseStrength: 45.0,
            gravity: 0.45,
            particleSize: 1.4,
            colorTheme: 0.0 // 0: Neon Vibe, 1: Aurora Green, 2: Solar Fire
        };

        // Interactive mouse variables
        this.rawMouse = { x: 0, y: 0, active: false };
        this.targetMouse3D = [999.0, 999.0, 999.0]; // far away initially
        this.currentMouse3D = [999.0, 999.0, 999.0];

        // WebGPU API objects
        this.adapter = null;
        this.device = null;
        this.context = null;
        this.presentationFormat = '';
        
        // GPU Buffers
        this.positionsBuffer = null;
        this.velocitiesBuffer = null;
        this.simParamsBuffer = null;
        this.renderParamsBuffer = null;

        // Pipelines
        this.computePipeline = null;
        this.renderPipeline = null;

        // Bind Groups
        this.computeBindGroup = null;
        this.renderBindGroup = null;

        // Animation metrics
        this.time = 0;
        this.lastTime = 0;
        this.frameTime = 0;
        this.isActive = true;
    }

    async init() {
        if (!navigator.gpu) {
            throw new Error("WebGPU is not supported by your browser/hardware.");
        }

        this.adapter = await navigator.gpu.requestAdapter({
            powerPreference: 'high-performance'
        });
        if (!this.adapter) {
            throw new Error("Failed to find a compatible GPU adapter.");
        }

        this.device = await this.adapter.requestDevice();
        this.context = this.canvas.getContext('webgpu');
        this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();

        const devicePixelRatio = window.devicePixelRatio || 1;
        this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
        this.canvas.height = this.canvas.clientHeight * devicePixelRatio;

        this.context.configure({
            device: this.device,
            format: this.presentationFormat,
            alphaMode: 'premultiplied'
        });

        // 1. Initialize storage and uniform buffers
        this._initBuffers();

        // 2. Build shader pipelines
        this._initPipelines();

        // 3. Setup event listeners
        this._setupEvents();

        this.lastTime = performance.now();
        this._tick();
    }

    _initBuffers() {
        const sizeFloat4 = 4; // vec4
        const totalFloats = this.PARTICLE_COUNT * sizeFloat4;
        const positionsData = new Float32Array(totalFloats);
        const velocitiesData = new Float32Array(totalFloats);

        // Populate initial positions in a beautiful 3D sphere distribution
        for (let i = 0; i < this.PARTICLE_COUNT; i++) {
            const u = Math.random();
            const v = Math.random();
            const theta = u * 2.0 * Math.PI;
            const phi = Math.acos(2.0 * v - 1.0);
            
            // Concentrate particles slightly towards the center of the sphere
            const r = Math.cbrt(Math.random()) * 8.5;

            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            positionsData[i * 4] = x;
            positionsData[i * 4 + 1] = y;
            positionsData[i * 4 + 2] = z;
            positionsData[i * 4 + 3] = 1.0; // speed (initialized to 1.0)

            // Introduce light spiral motion as initial velocity
            const speed = 0.5 + Math.random() * 0.5;
            velocitiesData[i * 4] = -y * 0.05 + (Math.random() - 0.5) * 0.15;
            velocitiesData[i * 4 + 1] = x * 0.05 + (Math.random() - 0.5) * 0.15;
            velocitiesData[i * 4 + 2] = (Math.random() - 0.5) * 0.2;
            velocitiesData[i * 4 + 3] = 0.0;
        }

        // Create Storage buffers on GPU
        this.positionsBuffer = this.device.createBuffer({
            label: "Positions Buffer",
            size: positionsData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(this.positionsBuffer, 0, positionsData);

        this.velocitiesBuffer = this.device.createBuffer({
            label: "Velocities Buffer",
            size: velocitiesData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(this.velocitiesBuffer, 0, velocitiesData);

        // Uniform buffers (Simulation parameters & Rendering parameters)
        this.simParamsBuffer = this.device.createBuffer({
            label: "Simulation Params Buffer",
            size: 64, // 16 floats (std140 aligned)
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.renderParamsBuffer = this.device.createBuffer({
            label: "Render Params Buffer",
            size: 80, // 20 floats (5 groups of 16 bytes, perfectly aligned)
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    _initPipelines() {
        // Compile shaders
        const computeModule = this.device.createShaderModule({
            label: "Swarm Compute Module",
            code: computeShaderCode
        });

        const renderModule = this.device.createShaderModule({
            label: "Swarm Render Module",
            code: renderShaderCode
        });

        // ================== COMPUTE PIPELINE ==================
        const computeBindGroupLayout = this.device.createBindGroupLayout({
            label: "Compute Bind Group Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                }
            ]
        });

        const computePipelineLayout = this.device.createPipelineLayout({
            label: "Compute Pipeline Layout",
            bindGroupLayouts: [computeBindGroupLayout]
        });

        this.computePipeline = this.device.createComputePipeline({
            label: "Swarm Compute Pipeline",
            layout: computePipelineLayout,
            compute: {
                module: computeModule,
                entryPoint: "main"
            }
        });

        this.computeBindGroup = this.device.createBindGroup({
            label: "Compute Bind Group",
            layout: computeBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.positionsBuffer } },
                { binding: 1, resource: { buffer: this.velocitiesBuffer } },
                { binding: 2, resource: { buffer: this.simParamsBuffer } }
            ]
        });

        // ================== RENDER PIPELINE ==================
        const renderBindGroupLayout = this.device.createBindGroupLayout({
            label: "Render Bind Group Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                }
            ]
        });

        const renderPipelineLayout = this.device.createPipelineLayout({
            label: "Render Pipeline Layout",
            bindGroupLayouts: [renderBindGroupLayout]
        });

        this.renderPipeline = this.device.createRenderPipeline({
            label: "Swarm Render Pipeline",
            layout: renderPipelineLayout,
            vertex: {
                module: renderModule,
                entryPoint: "vs_main"
            },
            fragment: {
                module: renderModule,
                entryPoint: "fs_main",
                targets: [
                    {
                        format: this.presentationFormat,
                        // Additive blending for highly luminous, organic particle effects
                        blend: {
                            color: {
                                srcFactor: 'src-alpha',
                                dstFactor: 'one',
                                operation: 'add'
                            },
                            alpha: {
                                srcFactor: 'zero',
                                dstFactor: 'one',
                                operation: 'add'
                            }
                        }
                    }
                ]
            },
            primitive: {
                topology: 'triangle-list'
            }
        });

        this.renderBindGroup = this.device.createBindGroup({
            label: "Render Bind Group",
            layout: renderBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.positionsBuffer } },
                { binding: 1, resource: { buffer: this.renderParamsBuffer } }
            ]
        });
    }

    _setupEvents() {
        const updateMousePosition = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            // Normalized screen coordinates [-1.0, 1.0]
            this.rawMouse.x = ((e.clientX - rect.left) / rect.width) * 2.0 - 1.0;
            this.rawMouse.y = -(((e.clientY - rect.top) / rect.height) * 2.0 - 1.0);
            this.rawMouse.active = true;
        };

        window.addEventListener('mousemove', updateMousePosition);
        window.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) {
                updateMousePosition(e.touches[0]);
            }
        });

        const handleMouseLeave = () => {
            this.rawMouse.active = false;
            // Instantly send mouse far away
            this.targetMouse3D = [999.0, 999.0, 999.0];
        };

        window.addEventListener('mouseleave', handleMouseLeave);
        window.addEventListener('touchend', handleMouseLeave);

        // Adjust aspect ratio and canvas layout dynamically on window resizing
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const width = entry.contentRect.width;
                const height = entry.contentRect.height;
                const dpr = window.devicePixelRatio || 1;
                
                this.canvas.width = width * dpr;
                this.canvas.height = height * dpr;

                this.context.configure({
                    device: this.device,
                    format: this.presentationFormat,
                    alphaMode: 'premultiplied'
                });
            }
        });
        resizeObserver.observe(this.canvas);
    }

    _updateMouse3D(aspect) {
        if (this.rawMouse.active) {
            // Animate Camera orbiting exactly like in _writeUniforms to align the vectors
            const radius = 18.0;
            const angle = this.time * 0.08;
            const eye = [
                Math.sin(angle) * radius * 0.4,
                Math.cos(angle * 0.5) * radius * 0.2,
                Math.cos(angle) * radius * 0.9 + 5.0
            ];
            const center = [0.0, 0.0, 0.0];
            const up = [0.0, 1.0, 0.0];

            // Calculate LookAt direction vectors in world space
            let z0 = eye[0] - center[0];
            let z1 = eye[1] - center[1];
            let z2 = eye[2] - center[2];
            let lenZ = Math.hypot(z0, z1, z2);
            if (lenZ > 0) {
                const invLenZ = 1.0 / lenZ;
                z0 *= invLenZ; z1 *= invLenZ; z2 *= invLenZ;
            }

            let x0 = up[1] * z2 - up[2] * z1;
            let x1 = up[2] * z0 - up[0] * z2;
            let x2 = up[0] * z1 - up[1] * z0;
            let lenX = Math.hypot(x0, x1, x2);
            if (lenX > 0) {
                const invLenX = 1.0 / lenX;
                x0 *= invLenX; x1 *= invLenX; x2 *= invLenX;
            }

            let y0 = z1 * x2 - z2 * x1;
            let y1 = z2 * x0 - z0 * x2;
            let y2 = z0 * x1 - z1 * x0;

            // Calculate true camera frustum scale on the plane passing through origin perpendicular to sightline
            const distance = Math.hypot(eye[0], eye[1], eye[2]);
            const fov = Math.PI / 4.0;
            const halfHeight = distance * Math.tan(fov / 2.0);
            const halfWidth = halfHeight * aspect;

            // Project mouse exactly onto this camera-oriented plane under the user's cursor
            this.targetMouse3D = [
                (this.rawMouse.x * halfWidth * x0) + (this.rawMouse.y * halfHeight * y0),
                (this.rawMouse.x * halfWidth * x1) + (this.rawMouse.y * halfHeight * y1),
                (this.rawMouse.x * halfWidth * x2) + (this.rawMouse.y * halfHeight * y2)
            ];
        }

        // Interpolate mouse movement for organic fluid inertia
        const lerpFactor = 0.08;
        if (this.targetMouse3D[0] > 900.0) {
            this.currentMouse3D = [999.0, 999.0, 999.0];
        } else {
            if (this.currentMouse3D[0] > 900.0) {
                this.currentMouse3D = [...this.targetMouse3D];
            } else {
                this.currentMouse3D[0] += (this.targetMouse3D[0] - this.currentMouse3D[0]) * lerpFactor;
                this.currentMouse3D[1] += (this.targetMouse3D[1] - this.currentMouse3D[1]) * lerpFactor;
                this.currentMouse3D[2] += (this.targetMouse3D[2] - this.currentMouse3D[2]) * lerpFactor;
            }
        }
    }

    _writeUniforms(deltaTime) {
        const aspect = this.canvas.width / this.canvas.height;
        this._updateMouse3D(aspect);

        // 1. Pack and write Simulation Parameters (64 bytes, 16 floats)
        const simData = new Float32Array(16);
        simData[0] = this.currentMouse3D[0];
        simData[1] = this.currentMouse3D[1];
        simData[2] = this.currentMouse3D[2];
        
        simData[3] = this.time;
        simData[4] = deltaTime;
        simData[5] = this.controls.noiseFreq;
        simData[6] = this.controls.noiseSpeed;
        simData[7] = this.controls.noiseStrength;
        
        simData[8] = this.controls.mouseRadius;
        simData[9] = this.controls.mouseStrength;
        simData[10] = this.controls.gravity;
        simData[11] = this.controls.particleSize;
        simData[12] = this.controls.colorTheme;
        
        // simData[13], simData[14], simData[15] are padding

        this.device.queue.writeBuffer(this.simParamsBuffer, 0, simData);

        // 2. Compute View-Projection matrices for 3D Camera rendering
        const viewMatrix = Math3D.createMat4();
        const projMatrix = Math3D.createMat4();
        const viewProjMatrix = Math3D.createMat4();

        // Animate Camera orbiting slightly for dynamic parallax effect
        const radius = 18.0;
        const angle = this.time * 0.08;
        const cameraEye = [
            Math.sin(angle) * radius * 0.4,
            Math.cos(angle * 0.5) * radius * 0.2,
            Math.cos(angle) * radius * 0.9 + 5.0
        ];
        
        Math3D.lookAtMat4(viewMatrix, cameraEye, [0, 0, 0], [0, 1, 0]);
        Math3D.perspectiveMat4(projMatrix, Math.PI / 4.0, aspect, 0.1, 100.0);
        Math3D.multiplyMat4(viewProjMatrix, projMatrix, viewMatrix);

        // 3. Pack and write Render Parameters (80 bytes, 20 floats)
        const renderData = new Float32Array(20);
        // Mat4 occupies indices 0-15 (64 bytes)
        for (let i = 0; i < 16; i++) {
            renderData[i] = viewProjMatrix[i];
        }
        
        // Single floats occupy indices 16-19
        renderData[16] = this.controls.particleSize;
        renderData[17] = this.controls.colorTheme;
        renderData[18] = aspect;
        // renderData[19] is padding

        this.device.queue.writeBuffer(this.renderParamsBuffer, 0, renderData);
    }

    _tick() {
        if (!this.isActive) return;

        requestAnimationFrame(() => this._tick());

        const now = performance.now();
        // Cap deltaTime to avoid visual jumping when tab changes focus
        const deltaTime = Math.min((now - this.lastTime) / 1000.0, 0.032);
        this.lastTime = now;
        this.time += deltaTime;

        // Write both Uniform Buffers
        this._writeUniforms(deltaTime);

        // Create a single command encoder for the entire GPU execution
        const commandEncoder = this.device.createCommandEncoder({
            label: "Swarm Master Command Encoder"
        });

        // ================== COMPUTE PASS ==================
        const computePassEncoder = commandEncoder.beginComputePass({
            label: "Swarm Compute Pass"
        });
        computePassEncoder.setPipeline(this.computePipeline);
        computePassEncoder.setBindGroup(0, this.computeBindGroup);
        // Workgroup size is 64, dispatch workgroups matching particle count
        computePassEncoder.dispatchWorkgroups(Math.ceil(this.PARTICLE_COUNT / 64));
        computePassEncoder.end();

        // ================== RENDER PASS ==================
        const textureView = this.context.getCurrentTexture().createView();
        
        const renderPassEncoder = commandEncoder.beginRenderPass({
            label: "Swarm Render Pass",
            colorAttachments: [
                {
                    view: textureView,
                    clearValue: { r: 0.02, g: 0.02, b: 0.05, a: 1.0 }, // premium dark midnight blue
                    loadOp: 'clear',
                    storeOp: 'store'
                }
            ]
        });

        renderPassEncoder.setPipeline(this.renderPipeline);
        renderPassEncoder.setBindGroup(0, this.renderBindGroup);
        // Draw 6 vertices per quad for 100,000 particle instances
        renderPassEncoder.draw(6, this.PARTICLE_COUNT);
        renderPassEncoder.end();

        // Submit both passes in one queue sequence
        this.device.queue.submit([commandEncoder.finish()]);
    }

    setControl(key, value) {
        if (key in this.controls) {
            this.controls[key] = Number(value);
        }
    }

    destroy() {
        this.isActive = false;
        window.removeEventListener('mousemove', this._updateMouse3D);
    }
}
