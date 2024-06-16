class Particle {
    constructor() {
        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.lifetime = 0;
        this.age = 0;
        this.color = new THREE.Color();
        this.size = 0;
        this.isActive = false;
    }

    init(position, velocity, lifetime, color, size) {
        this.position.copy(position);
        this.velocity.copy(velocity);
        this.lifetime = lifetime;
        this.age = 0;
        this.color.copy(color);
        this.size = size;
        this.isActive = true;
    }

    update(delta) {
        if (!this.isActive) return;
        this.position.add(this.velocity.clone().multiplyScalar(delta));
        this.age += delta;
        if (this.age >= this.lifetime) {
            this.isActive = false;
        }
    }

    isAlive() {
        return this.isActive;
    }

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
        pointTexture: {value: new THREE.TextureLoader().load('point.png')}
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

function createParticle(position, velocity, lifetime, color, size) {
    for (let i = 0; i < maxParticles; i++) {
        let particle = particles[i];
        if (!particle.isAlive()) {
            particle.init(position, velocity, lifetime, color, size);
            return;
        }
    }
}


// Function to generate a random bright color
function getRandomBrightColor() {
    // Generate a random color with high values to ensure brightness
    const hue = Math.floor(Math.random() * 360); // Hue between 0 and 360
    const saturation = 100; // Saturation at 100%
    const lightness = 50; // Lightness at 50% to ensure brightness but not white
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function getExplosionColor() {
    // Adjust the range of RGB values for shades of bright red or orange
    const red = Math.floor(Math.random() * 200 + 150); // Random value between 55 and 255 for red component
    const green = Math.floor(Math.random() * 120); // Random value between 0 and 100 for green component
    return `rgb(${red}, ${green}, 0)`;
}

function createNewParticles(position, size, partyMode) {
    for (let i = 0; i < (40 * size); i++) {
        const randomX = Math.random() * ((vMax * size) - (vMin * size)) + (vMin * size);
        const randomY = Math.random() * ((vMax * size) - (vMin * size)) + (vMin * size);

        let velocity = new THREE.Vector3(randomX, randomY, 0.5);
        createParticle(position, velocity, (partyMode ? 2 : 0.8),
            new THREE.Color(partyMode ? getRandomBrightColor() : getExplosionColor()), Math.random() * 5 + 0.1);
    }
}