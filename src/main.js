import { PhaseSwarm } from './scene/PhaseSwarm.js';

document.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('webgpu-canvas');
    const warningOverlay = document.getElementById('webgpu-warning');
    const indicatorDot = document.getElementById('indicator-dot');

    // UI Sliders and Value Displays
    const sliders = [
        { id: 'noiseStrength', label: 'val-noiseStrength' },
        { id: 'noiseFreq', label: 'val-noiseFreq' },
        { id: 'noiseSpeed', label: 'val-noiseSpeed' },
        { id: 'gravity', label: 'val-gravity' },
        { id: 'mouseRadius', label: 'val-mouseRadius' },
        { id: 'mouseStrength', label: 'val-mouseStrength' },
        { id: 'particleSize', label: 'val-particleSize' }
    ];

    let swarmInstance = null;

    try {
        // 1. Instantiate and initialize PhaseSwarm on the canvas
        swarmInstance = new PhaseSwarm(canvas);
        await swarmInstance.init();

        console.log("Organic Swarm GPGPU WebGPU: Successful initialization.");

        // 2. Bind sliders to update simulation controls dynamically
        sliders.forEach(({ id, label }) => {
            const inputElement = document.getElementById(`ctrl-${id}`);
            const displayElement = document.getElementById(label);

            if (inputElement && displayElement) {
                // Update on dragging for high responsiveness
                inputElement.addEventListener('input', (e) => {
                    const value = parseFloat(e.target.value);
                    displayElement.textContent = value.toFixed(id === 'noiseFreq' ? 2 : 1);
                    swarmInstance.setControl(id, value);
                });
            }
        });

        // 3. Bind Theme Buttons to change particle colors and status indicator theme
        const themeButtons = document.querySelectorAll('.theme-btn');
        themeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const themeVal = parseFloat(e.target.getAttribute('data-theme'));
                
                // Toggle active class on buttons
                themeButtons.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                // Update simulation control
                swarmInstance.setControl('colorTheme', themeVal);

                // Update indicator dot color theme
                indicatorDot.className = 'status-dot';
                if (themeVal === 1.0) {
                    indicatorDot.classList.add('active-theme-1'); // Aurora Green
                } else if (themeVal === 2.0) {
                    indicatorDot.classList.add('active-theme-2'); // Solar Fire
                }
            });
        });

    } catch (err) {
        console.error("WebGPU Initialization Error:", err);
        // Show fallback overlay if browser or hardware does not support WebGPU
        if (warningOverlay) {
            warningOverlay.style.display = 'flex';
        }
    }
});
