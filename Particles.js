/**
 * Particle class representing an individual particle in the system.
 */
class Particle {
    /**
     * Creates an instance of a Particle.
     */  constructor() {
        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.lifetime = 0;
        this.age = 0;
        this.color = new THREE.Color();
        this.size = 0;
        this.isActive = false;
    }

    /**
     * Initializes the particle with given parameters.
     * @param {THREE.Vector3} position - Initial position of the particle.
     * @param {THREE.Vector3} velocity - Initial velocity of the particle.
     * @param {number} lifetime - Lifetime of the particle.
     * @param {THREE.Color} color - Color of the particle.
     * @param {number} size - Size of the particle.
     */
    init(position, velocity, lifetime, color, size) {
        this.position.copy(position);
        this.velocity.copy(velocity);
        this.lifetime = lifetime;
        this.age = 0;
        this.color.copy(color);
        this.size = size;
        this.isActive = true;
    }

    /**
     * Updates the particle's position and age.
     * @param {number} delta - Time delta for the update.
     */
    update(delta) {
        if (!this.isActive) return;
        this.position.add(this.velocity.clone().multiplyScalar(delta));
        this.age += delta;
        if (this.age >= this.lifetime) {
            this.isActive = false;
        }
    }

    /**
     * Checks if the particle is active (alive).
     * @returns {boolean} - True if the particle is active, false otherwise.
     */
    isAlive() {
        return this.isActive;
    }

    /**
     * Gets the alpha value (transparency) of the particle based on its age.
     * @returns {number} - The alpha value.
     */
    getAlpha() {
        return 1.0 - (this.age / this.lifetime);
    }
}

const vMin = -2, vMax = 2; // Controls particle speed
const particleVertexShader = `
    attribute float size;
    attribute vec3 customColor;
    attribute float alpha;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
        vColor = customColor;
        vAlpha = alpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const particleFragmentShader = `
    uniform sampler2D pointTexture;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
        gl_FragColor = vec4(vColor, vAlpha);
        gl_FragColor = gl_FragColor * texture2D(pointTexture, gl_PointCoord);
    }
`;

const particleShaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
        pointTexture: {value: new THREE.TextureLoader().load('images/point.png')}
    },
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    transparent: true
});

const maxParticles = 1000;
let particles = new Array(maxParticles).fill().map(() => new Particle());

let particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(maxParticles * 3), 3));
particleGeometry.setAttribute('customColor', new THREE.Float32BufferAttribute(new Float32Array(maxParticles * 3), 3));
particleGeometry.setAttribute('size', new THREE.Float32BufferAttribute(new Float32Array(maxParticles), 1));
particleGeometry.setAttribute('alpha', new THREE.Float32BufferAttribute(new Float32Array(maxParticles), 1));

/**
 * Updates and manages the particles in the system.
 * @param {number} delta - Time delta for the update.
 */
function updateParticles(delta) {
    let positions = particleGeometry.attributes.position.array;
    let colors = particleGeometry.attributes.customColor.array;
    let sizes = particleGeometry.attributes.size.array;
    let alphas = particleGeometry.attributes.alpha.array;

    for (let i = maxParticles - 1; i >= 0; i--) {
        let particle = particles[i];

        if (particle.isAlive()) {
            particle.update(delta);

            positions[i * 3] = particle.position.x;
            positions[i * 3 + 1] = particle.position.y;
            positions[i * 3 + 2] = particle.position.z;

            colors[i * 3] = particle.color.r;
            colors[i * 3 + 1] = particle.color.g;
            colors[i * 3 + 2] = particle.color.b;

            sizes[i] = particle.size;
            alphas[i] = particle.getAlpha();
        } else {
            // Reset attributes to a default value or move the last particle to this position
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;

            colors[i * 3] = 0;
            colors[i * 3 + 1] = 0;
            colors[i * 3 + 2] = 0;

            sizes[i] = 0;
            alphas[i] = 0;
        }
    }

    particleGeometry.attributes.position.needsUpdate = true;
    particleGeometry.attributes.customColor.needsUpdate = true;
    particleGeometry.attributes.size.needsUpdate = true;
    particleGeometry.attributes.alpha.needsUpdate = true;

    // Update old particles
    particlesGroup.children.forEach((particle) => {
        particle.position.add(particle.velocity);
        particle.life -= (delta * 10);
        if (particle.life <= 0) {
            particlesGroup.remove(particle);
        }
    });
    thrustParticles = thrustParticles.filter((particle) => {
        particle.life -= delta;
        if (particle.life <= 0) {
            particlesGroup.remove(particle);
            return false;
        }
        particle.position.add(particle.velocity.clone().multiplyScalar(delta));
        checkParticleAsteroidCollisions(particle);
        return true;
    });
}

/**
 * Creates and initializes a new particle.
 * @param {THREE.Vector3} position - Initial position of the particle.
 * @param {THREE.Vector3} velocity - Initial velocity of the particle.
 * @param {number} lifetime - Lifetime of the particle.
 * @param {THREE.Color} color - Color of the particle.
 * @param {number} size - Size of the particle.
 */
function createParticle(position, velocity, lifetime, color, size) {
    for (let i = 0; i < maxParticles; i++) {
        let particle = particles[i];
        if (!particle.isAlive()) {
            particle.init(position, velocity, lifetime, color, size);
            return;
        }
    }
}

/**
 * Generates a random bright color.
 * @returns {string} - Bright color in HSL format.
 */
function getRandomBrightColor() {
    // Generate a random color with high values to ensure brightness
    const hue = Math.floor(Math.random() * 360); // Hue between 0 and 360
    const saturation = 100; // Saturation at 100%
    const lightness = 50; // Lightness at 50% to ensure brightness but not white
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Generates a random bright red or orange colour for explosion.
 * @returns {string} - Colour in RGB format.
 */
function getExplosionColor() {
    // Adjust the range of RGB values for shades of bright red or orange
    const red = Math.floor(Math.random() * 200 + 150); // Random value between 55 and 255 for red component
    const green = Math.floor(Math.random() * 120); // Random value between 0 and 100 for green component
    return `rgb(${red}, ${green}, 0)`;
}

/**
 * Creates multiple new particles at a given position with specified size and mode.
 * @param {THREE.Vector3} position - Position where particles will be created.
 * @param {number} size - Size scale for the particles.
 * @param {boolean} partyMode - Whether to use random bright colours (party mode) or explosion colors.
 */
function createNewParticles(position, size, partyMode) {
    for (let i = 0; i < (40 * size); i++) {
        const randomX = Math.random() * ((vMax * size) - (vMin * size)) + (vMin * size);
        const randomY = Math.random() * ((vMax * size) - (vMin * size)) + (vMin * size);

        let velocity = new THREE.Vector3(randomX, randomY, 0.5);
        createParticle(position, velocity, (partyMode ? 2 : 0.8),
            new THREE.Color(partyMode ? getRandomBrightColor() : getExplosionColor()), Math.random() * 5 + 0.1);
    }
}