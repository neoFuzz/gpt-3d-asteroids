const scoreMapping = {
    4: 1000, // Saucer
    3: 20,
    2: 50,
    1: 100
};
const audioContext = new (window.AudioContext || window.webkitAudioContext)(), shotDelay = 0.1; // seconds
const loader = new THREE.OBJLoader();
let particleSystem = new THREE.Points(particleGeometry, particleShaderMaterial);
let scene, camera, renderer, asteroidGroup, particlesGroup, starField,
    level = 1, blinkDuration = 0.2, maxSpeed = 1;
let clock = new THREE.Clock();
let startScreen = true, endScreen = false;
let partyMode = false, debugMode = false;

let thrustLights = []; // Array to hold thrust lights
let thrustParticles = []; // Array to hold thrust particles
let saucer, player, players = new Map();

resetReadyPanel();
document.getElementById("playerStatus").style.display = "flex";

const keysPressed = {};
document.addEventListener('keydown', (event) => keysPressed[event.key] = true);
document.addEventListener('keyup', (event) => keysPressed[event.key] = false);
let playerModel, pmUrl = "models/a-tri.obj";

// Add event listeners for gamepad connection and disconnection
window.addEventListener('gamepadconnected', (event) => {
    console.log('Gamepad connected:', event.gamepad);

    // Create a new player object for the connected gamepad
    const color = new THREE.Color(`hsl(${Math.random() * 360}, 100%, 50%)`);
    let newPlayer = new Player(color, event.gamepad.index);
    newPlayer.invulnerablePhase = new InvulnerablePhase(newPlayer);
    newPlayer.playerMesh.name = "player" + event.gamepad.index;

    // Add the new player to the players array
    players.set(event.gamepad.index, newPlayer);
});

window.addEventListener('gamepaddisconnected', (event) => {
    console.log('Gamepad disconnected:', event.gamepad);
    const removedPad = event.gamepad.index;

    // Find the player with the disconnected gamepad
    let playerObj = players.get(removedPad);

    if (playerObj !== undefined) {
        // Remove the player's mesh from the scene
        if (!startScreen || !endScreen)
            scene.remove(playerObj.playerMesh);

        // Remove the player from the players array
        players.delete(removedPad);
        const pg = "player" + playerObj.gamepadIndex;
        document.getElementById(pg + "Score").style.display = "none";
        document.getElementById(pg + "Lives").style.display = "none";
    }
});

let shootingSound, explosionSound, warpSound, readySound;
loadSound('sounds/ready.mp3').then(buffer => readySound = buffer);
loadSound('sounds/laser.mp3').then(buffer => shootingSound = buffer);
loadSound('sounds/explosion.mp3').then(buffer => explosionSound = buffer);
loadSound('sounds/warp.mp3').then(buffer => warpSound = buffer);

/**
 * Resets the player ready panel to default state and updates high scores.
 */
function resetReadyPanel() {
    let i = -1;
    let statusPanels = document.getElementById('playerStatus')
        .querySelectorAll('.scoreDisplay');
    statusPanels.forEach(panel => {
        const pl = "Player" + (i === -1 ? "KB" : i) + "Score";
        let pStr = `<span style="color: red">Player ${i === -1 ? "KB" : i + 1} Not Ready</span>`;
        let cs,
            hs = localStorage.getItem("p" + pl.substring(1)) || 0;
        try {
            cs = players.get(i).score;
        } catch (e) {
            cs = 0;
        }
        hs = hs < cs ? cs : hs;
        pStr += "High score: " + hs;
        panel.style.color = "white";
        panel.innerHTML = pStr;
        i++;
    });
}

/**
 * Updates the player's score display based on the provided index and count.
 * @param {number} index - The index of the player.
 * @param {number} score - The score count to update.
 */
function updatePlayerScoreDisplay(index, score) {
    document.getElementById('player' + index + 'Score').innerText = 'P' + (index + 1) + ' Score: ' + score;
}

/**
 * Updates the player's lives display based on the provided index and count.
 * @param {number} index - The index of the player.
 */
function updatePlayerLivesDisplay(index) {
    let ll = players.get(index).lives;
    let ld = ll <= 0 ? 0 : ll - 1;
    document.getElementById('player' + index + 'Lives').innerText = 'P' + (index + 1) + ' Lives: ' + ld;
}

/**
 * Checks if the game music has finished playing, and if so, restarts it.
 */
function checkMusic() {
    let totalTime = document.querySelector("body > midi-player").shadowRoot
        .querySelector("div > div:nth-child(2) > span.total-time").innerText;
    let pos = document.querySelector("body > midi-player").shadowRoot
        .querySelector("div > div:nth-child(2) > span.current-time").innerText;
    if (pos === totalTime && document.querySelector("body > midi-player").shadowRoot
        .querySelector("div").classList.contains('stopped')) {
        document.querySelector("body > midi-player").shadowRoot.querySelector("div > button").click();
    }
}

/**
 * Game loop that handles start and end screen updates.
 */
function screenLoop() {
    const d = clock.getDelta();
    handleGamepadInput(d);
    updateKBPlayer(d);
    if (!startScreen && !endScreen) {
        checkMusic();
        return;
    }
    requestAnimationFrame(screenLoop);
}

window.onload = () => {
    document.getElementById('startScreen').style.display = 'flex';
    loader.load(
        pmUrl,
        function (obj) {
            playerModel = obj.clone();
            player = new Player(0x00FF00, null);
            player.lives = 0;
            player.invulnerablePhase = new InvulnerablePhase(player);
            requestAnimationFrame(screenLoop);
        },
        function (xhr) {
            console.log(pmUrl + ' ' + (xhr.loaded / xhr.total * 100) + '% loaded');
        },
        function (err) {
            console.error('An error happened');
        });
};

/**
 * Loads a sound from the specified URL and decodes it into an AudioBuffer.
 * @param {string} url - The URL of the sound file.
 * @returns {Promise<AudioBuffer>} - A promise that resolves to the decoded audio buffer.
 */
function loadSound(url) {
    return fetch(url)
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer));
}

/**
 * Plays the provided sound buffer.
 * @param {AudioBuffer} buffer - The audio buffer to play.
 */
function playSound(buffer) {
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start();
}

/**
 * Starts the game, hiding the start screen and initiating game functions.
 */
function startGame() {
    document.getElementById('startScreen').style.display = 'none';
    if (startScreen) {
        document.querySelector("body > midi-player").shadowRoot.querySelector("div > button").click();
        startScreen = false;
    }
    init();
}

/**
 * Restarts the game, resetting all relevant parameters and settings.
 */
function restartGame() {
    document.getElementById('gameOverScreen').style.display = 'none';
    level = 1;
    endScreen = false;
    player.score = 0;
    player.isInvulnerable = false;
    player.bullets = [];
    players.forEach((p) => {
        p.lives = 0;
        p.score = 0;
        p.isInvulnerable = false;
        p.bullets = [];
    });
    init();
}

/**
 * Initializes the game, setting up the scene, players, and other components.
 */
function init() {
    document.getElementById("debug").style.display = debugMode ? "flex" : "none";
    document.getElementById("playerStatus").style.display = "none";
    scene = new THREE.Scene();
    particlesGroup = new THREE.Group();
    scene.add(particlesGroup);
    scene.add(particleSystem);
    setupCamera();
    setupRenderer();
    if (player.ready) {
        setupPlayer(player);
        document.getElementById("playerScore").style.display = "flex";
        document.getElementById("playerLives").style.display = "flex";
    } else {
        document.getElementById("playerScore").style.display = "none";
        document.getElementById("playerLives").style.display = "none";
    }
    players.forEach((p) => {
        setupPlayer(p);
        const pg = "player" + p.gamepadIndex;
        if (p.ready) {
            document.getElementById(pg + "Score").style.display = "flex";
            document.getElementById(pg + "Lives").style.display = "flex";
        } else {
            document.getElementById(pg + "Score").style.display = "none";
            document.getElementById(pg + "Lives").style.display = "none";
        }
    });
    // Create and spawn saucers
    Saucer.spawnRandomly(scene, pickRandomPlayer(), 'models/saucer.obj');

    setupStarField();
    setupLighting();
    setupAsteroids();
    setupEventListeners();
    updateScoreDisplay();
    updateLivesDisplay();
    animate();
}

/**
 * Sets up the game camera with orthographic projection.
 */
function setupCamera() {
    const aspectRatio = window.innerWidth / window.innerHeight;
    const viewSize = 20;
    const cameraWidth = viewSize * aspectRatio;
    const cameraHeight = viewSize;
    camera = new THREE.OrthographicCamera(
        cameraWidth / -2, cameraWidth / 2, cameraHeight / 2, cameraHeight / -2, 1, 2000);
    camera.position.z = 50;
}

/**
 * Configures the renderer and appends it to the document body.
 */
function setupRenderer() {
    if (!renderer) {
        renderer = new THREE.WebGLRenderer({
            antialias: true
        });
        document.body.appendChild(renderer.domElement);
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Generates a sequence of points in a spiral order.
 * @param {number} n - The number of points to generate.
 * @returns {Array<Array<number>>} - An array of [x, y] points.
 */
function generateSpiralSequence(n) {
    let direction = 0;
    let steps = 1;
    let x = 0,
        y = 0;
    let change = 0;
    let sequence = [[x, y]];

    while (sequence.length < n) {
        for (let i = 0; i < steps; i++) {
            if (sequence.length >= n) break;

            switch (direction) {
                case 0:
                    x++;
                    break;
                case 1:
                    y--;
                    break;
                case 2:
                    x--;
                    break;
                case 3:
                    y++;
                    break;
            }
            sequence.push([x, y]);
        }
        direction = (direction + 1) % 4;
        change++;

        if (change % 2 === 0)
            steps++;
    }
    return sequence;
}

/**
 * Sets up the star field in the game scene.
 */
function setupStarField() {
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 1000;
    const positions = new Float32Array(starsCount * 3);

    for (let i = 0; i < starsCount * 3; i += 3) {
        positions[i] = THREE.MathUtils.randFloatSpread(30);
        positions[i + 1] = THREE.MathUtils.randFloatSpread(30);
        positions[i + 2] = -100;
    }
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starsMaterial = new THREE.ShaderMaterial({
        uniforms: {time: {value: 1.0}},
        vertexShader: `
varying vec3 vPosition;
void main() {
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 2.0; // Adjust point size here
}`,
        fragmentShader: `
uniform float time;
varying vec3 vPosition;
float random (vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}
void main() {
    float twinkling = sin(dot(vPosition, vec3(12.9898, 78.233, 54.53)) * 43758.5453 + time) * 0.5 + 0.5;
    vec3 vibrantColor = vec3(random(vPosition.xy + time), random(vPosition.yz + time),
     random(vPosition.xz + time));
    gl_FragColor = vec4(vibrantColor * twinkling, 1.0);
}`,
        blending: THREE.AdditiveBlending,
        transparent: true,
    });

    starField = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(starField);
}

/**
 * Configures the lighting in the game scene.
 */
function setupLighting() {
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 1, 5);
    scene.add(light);
}

/**
 * Sets up asteroids in the game scene.
 */
function setupAsteroids() {
    asteroidGroup = new THREE.Group();
    particlesGroup = new THREE.Group();
    scene.add(asteroidGroup);
    scene.add(particlesGroup);
    addAsteroids(3, level + 2);
}

/**
 * Sets up event listeners for window resize and other events.
 */
function setupEventListeners() {
    window.addEventListener('resize', onWindowResize, false);
}

/**
 * Handles window resize events, adjusting camera and renderer settings.
 */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Updates the score display for the player and additional players.
 */
function updateScoreDisplay() {
    document.getElementById('playerScore').innerText = 'Score: ' + player.score;
    players.forEach((player, key) => {
        updatePlayerScoreDisplay(key, player.score);
    });
}

/**
 * Updates the lives display for the player and additional players.
 */
function updateLivesDisplay() {
    let ld = player.lives <= 0 ? 0 : player.lives - 1;
    document.getElementById('playerLives').innerText = 'Lives left: ' + ld;
    players.forEach((p, key) => {
        updatePlayerLivesDisplay(key);
    });
}

/**
 * Adds asteroids to the game scene.
 * @param {number} size - The size of the asteroids.
 * @param {number} number - The number of asteroids to add.
 * @param {THREE.Vector3} [pos] - The position to place the asteroids.
 * @returns {Array<THREE.Mesh>} - An array of new asteroids.
 */
function addAsteroids(size, number, pos) {
    const newAsteroids = [];
    const material = new THREE.MeshLambertMaterial({
        color: 0x8B4513
    });
    for (let i = 0; i < number; i++) {
        const geometry = getAsteroidGeometry(size);
        const asteroid = new THREE.Mesh(geometry, material);

        setPosition(asteroid, pos);
        setVelocity(asteroid);
        setRotation(asteroid);

        asteroid.size = size;
        asteroidGroup.add(asteroid);
        newAsteroids.push(asteroid);
    }
    return newAsteroids;
}

/**
 * Gets the geometry for an asteroid of a specified size.
 * @param {number} size - The size of the asteroid.
 * @returns {THREE.DodecahedronBufferGeometry} - The geometry of the asteroid.
 */
function getAsteroidGeometry(size) {
    switch (size) {
        case 3:
            return new THREE.DodecahedronBufferGeometry(2, 0);
        case 2:
            return new THREE.DodecahedronBufferGeometry(1, 0);
        case 1:
            return new THREE.DodecahedronBufferGeometry(0.5, 0);
    }
}

/**
 * Sets the position of an asteroid.
 * @param {THREE.Mesh} as - The asteroid to position.
 * @param {THREE.Vector3} [pos] - The position to set.
 */
function setPosition(as, pos) {
    if (!pos) {
        const edge = Math.floor(Math.random() * 4);
        const pos = Math.random() * 20 - 10;
        switch (edge) {
            case 0:
                as.position.set(pos, 10, 0);
                break;
            case 1:
                as.position.set(10, pos, 0);
                break;
            case 2:
                as.position.set(pos, -10, 0);
                break;
            case 3:
                as.position.set(-10, pos, 0);
                break;
        }
    } else {
        as.position.x = pos.x + (Math.random() - 0.5) * 2;
        as.position.y = pos.y + (Math.random() - 0.5) * 2;
    }
}

/**
 * Sets the velocity of an asteroid.
 * @param {THREE.Mesh} a - The asteroid to set velocity for.
 */
function setVelocity(a) {
    a.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.1,
        0);
}

/**
 * Sets the rotation of an asteroid.
 * @param {THREE.Mesh} as - The asteroid to set rotation for.
 */
function setRotation(as) {
    const upVector = new THREE.Vector3(0, 0, 1);
    as.rotationAxis = new THREE.Vector3().crossVectors(as.velocity, upVector).normalize();
    as.rotationSpeedMagnitude = as.velocity.length() * 0.05;
    as.rotationSpeed = {
        x: (Math.random() < 0.5 ? 1 : -1) * (Math.random() * 0.05 + 0.5), // Random rotation along the x-axis
        y: (Math.random() < 0.5 ? 1 : -1) * (Math.random() * 0.05 + 0.5), // Random rotation along the y-axis
        z: 0, // Consistent spin in one direction along the z-axis
    };
}

/**
 * Updates the score for a specified player.
 * @param {number} value - The score value to add.
 * @param {Object} owner - The player object to update.
 */
function updateScore(value, owner) {
    owner.score += scoreMapping[value] || 0;
    if (owner.score >= (10000 * (owner.livesGranted + 1))) {
        owner.lives++;
        owner.livesGranted++;
    }

    // Update displays
    updateScoreDisplay();
    updateLivesDisplay();
}

/**
 * Causes an asteroid to explode, creating smaller asteroids if applicable.
 * @param {THREE.Mesh} as - The asteroid to explode.
 * @param {Object} owner - The player responsible for the explosion.
 */
function explodeAsteroid(as, owner) {
    const velocityIncreaseFactor = 1.6;

    updateScore(as.size, owner);

    if (as.size > 1) {
        const newSize = as.size - 1;
        const newAsteroids = addAsteroids(newSize, 2, as.position);
        newAsteroids.forEach(newAsteroid => {
            newAsteroid.velocity.multiplyScalar(velocityIncreaseFactor);
        });
    }
    createNewParticles(as.position, as.size, partyMode);
    asteroidGroup.remove(as);
    playSound(explosionSound);

    // Create a point light at the asteroid's position
    const explosionLight = new THREE.PointLight(0xffffff, 5, 20); // white light, intensity 1, distance 10
    explosionLight.position.copy(as.position);
    scene.add(explosionLight);

    // Make the light fade out and remove it after a short duration
    let lightIntensity = 5;
    const fadeDuration = 2; // Duration in seconds for the light to fade out
    const fadeStep = (delta) => {
        lightIntensity -= delta / fadeDuration; // Calculate the new intensity
        if (lightIntensity <= 0) {
            scene.remove(explosionLight); // Remove the light from the scene
        } else {
            explosionLight.intensity = lightIntensity; // Update the light's intensity
            requestAnimationFrame(fadeStep); // Continue fading
        }
    };
    requestAnimationFrame(fadeStep);
}

/**
 * Creates a player mesh based on the provided colour.
 * @param {number} color - The colour of the player mesh.
 * @returns {THREE.Mesh} - The created player mesh.
 */
function createPlayerMesh(color) {
    const model = playerModel ?
        playerModel.children[0].geometry.clone().scale(0.05, 0.05, 0.05).clone() :
        new THREE.ConeGeometry(0.5, 1, 32);
    return new THREE.Mesh(model, new THREE.MeshPhongMaterial({
        color: color
    }))
}

/**
 * Creates a thrust trail behind a player.
 * @param {Player} p - The player object to create thrust trail for.
 */
function createThrustTrail(p) {
    const particleCount = 3; // Number of particles to create for each thrust, adjust as needed
    const geometry = new THREE.SphereGeometry(0.05, 6, 6); // Smaller geometry for particles
    const material = new THREE.MeshBasicMaterial({
        color: 0xff6600
    }); // Orange color for the thrust

    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(geometry, material);

        // Position the particles at the base of the cone
        let offset = new THREE.Vector3(0, -0.75, 0); // Adjust the offset as needed
        offset.applyQuaternion(p.playerMesh.quaternion);
        particle.position.set(p.playerMesh.position.x + offset.x,
            p.playerMesh.position.y + offset.y, 0);

        // Give the particles an initial velocity with reduced spread
        let velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.2, // Reduce the randomness in x component
            -0.5 - Math.random() * 0.1, // Make y component more consistent and downward
            0 // Reduce the randomness in z component
        ); //.normalize().multiplyScalar(0.5); // Adjust the scalar as needed
        velocity.applyQuaternion(p.playerMesh.quaternion);

        particle.life = 0.5; // Particle lifetime in seconds
        particle.velocity = velocity; // Set particle velocity and lifetime

        particlesGroup.add(particle);
        thrustParticles.push(particle); // Add to the array of thrust particles
    }

    const offset = new THREE.Vector3(0, -0.75, 0);
    const thrustLight = new THREE.PointLight(0xff6600, 1, 5);
    thrustLight.position.set(p.playerMesh.position.x + offset.x,
        p.playerMesh.position.y + offset.y,
        0);
    thrustLight.life = 0.3; // Set light life to 300ms

    scene.add(thrustLight);
    thrustLights.push(thrustLight);
}

/**
 * Updates the thrust lights over time, removing expired lights.
 * @param {number} d - The time elapsed since the last frame.
 */
function updateThrustLights(d) {
    thrustLights = thrustLights.filter((light) => {
        light.life -= d;
        if (light.life <= 0) {
            scene.remove(light);
            return false;
        }
        return true;
    });
}

/**
 * Shoots a bullet from the player's position.
 * @param {Player} p - The player object that shoots.
 */
function shoot(p) {
    // Check if there are already 3 bullets, exit if so
    if (p !== null) {
        if (p.bullets.length >= 3) {
            return;
        }
    }

    if (p === null || p === undefined) {
        console.error("shoot() got NULL player")
    }

    // Get the elapsed time since the last shot
    const elapsedTime = p.shotClock.getElapsedTime();

    // Check if enough time has passed since the last shot
    if (elapsedTime < shotDelay) {
        return; // Delay not met, exit the function
    }

    // Reset the clock for the next shot
    p.shotClock.start();

    const bulletMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 8),
        new THREE.MeshPhongMaterial({
            color: 0xff0000
        }));
    let offset = new THREE.Vector3(0, 1, 0);
    offset.applyQuaternion(p.playerMesh.quaternion);
    bulletMesh.position.set(p.playerMesh.position.x + offset.x,
        p.playerMesh.position.y + offset.y,
        p.playerMesh.position.z + offset.z);

    let velocity = new THREE.Vector3(0, 0.5, 0);
    velocity.applyQuaternion(p.playerMesh.quaternion);
    bulletMesh.velocity = velocity;

    // Create a point light and attach it to the bullet
    let bulletLight = new THREE.PointLight(0xff0000, 2, 10); // Parameters: color, intensity, distance
    bulletLight.position.set(bulletMesh.position.x, bulletMesh.position.y, bulletMesh.position.z);

    bulletMesh.add(bulletLight); // Attach the light to the bullet
    p.bullets.push({
        mesh: bulletMesh,
        light: bulletLight,
        life: 0.38
    }); // Add the bullet to the bullets array

    scene.add(bulletLight);
    scene.add(bulletMesh);
    playSound(shootingSound);
}

/**
 * Processes and updates the high scores and local storage.
 * @returns {string} - The formatted high score display string.
 */
function processHighScores() {
    let hsMap = new Map();
    let ls = localStorage.getItem("playerKBScore");
    if (ls === null) {
        localStorage.setItem("playerKBScore", player.score);
        hsMap.set("playerKBScore", ls);
    } else {
        if (player.score > ls) {
            ls = player.score;
            hsMap.set("playerKBScore", ls);
        }
        localStorage.setItem("playerKBScore", ls);
    }
    player.shotClock.start();
    players.forEach((p) => {
        p.ready = false;
        p.shotClock.start();
        const pGI = `player${p.gamepadIndex}Score`;
        let ls = localStorage.getItem(pGI);
        if (ls === null) {
            localStorage.setItem(pGI, p.score);
            hsMap.set(p.gamepadIndex, ls);
        } else {
            if (p.score > ls) {
                ls = p.score;
                hsMap.set(p.gamepadIndex, ls);
            }
            localStorage.setItem(pGI, ls);
        }
    });

    let op = "";
    players.forEach(p => {
        let phs = "";
        if (hsMap.has(p.gamepadIndex))
            phs = `<br><span class="animated-rainbow-text">New high score!</span>`
        op += `<li><span class="score-left">Player ${p.gamepadIndex + 1}</span><span class="score-right">${p.score}</span>${phs}</li>`;
    });
    let fs = `Game Over! Final scores:<br><ol>`;
    if (player.score !== 0) {
        let phs = "";
        if (hsMap.has("playerKBScore"))
            phs = `<br><span class="animated-rainbow-text">New high score!</span>`;
        fs += `<li><span class="score-left">KB Player</span>
<span class="score-right">${player.score}</span>${phs}</li>`;
    }
    fs += `${op}</ol>`;
    return fs;
}

/**
 * Ends the game and displays the game over screen.
 */
function endGame() {
    // Check if any player still has lives left
    const isAnyPlayerAlive = Array.from(players.values()).some(p => p.lives > 0);

    players.forEach((p) => {
        if (p.lives === 0 && scene.getObjectByName(p.playerMesh.name) !== null) {
            p.ready = false;
            scene.remove(p.playerMesh);
        }
    });

    if (player.lives === 0 && scene.getObjectByName(player.playerMesh.name) !== null) {
        player.ready = false;
        scene.remove(player.playerMesh);
    }

    // If any player still has lives, return early from the function
    if (isAnyPlayerAlive || player.lives > 0)
        return;

    endScreen = true;
    let fs = processHighScores();
    resetReadyPanel();
    document.getElementById("playerStatus").style.display = "flex";
    document.getElementById("finalScore").innerHTML = fs;
    document.getElementById("gameOverScreen").style.display = "flex";
    document.getElementById("playerStatus").style.display = "flex";
    requestAnimationFrame(screenLoop);
}

/**
 * Checks if a player collides with an asteroid.
 * @param {THREE.Mesh} asteroid - The asteroid to check collision with.
 * @param {number} rad - The radius of the asteroid.
 * @param {Object} p - The player object to check collision for.
 * @returns {boolean} - True if there is a collision, false otherwise.
 */
function checkAsteroidCollision(asteroid, rad, p) {
    if (p === null || p === player) {
        p = player;
    }
    if (p.playerMesh.geometry.boundingSphere === null || !p.ready)
        return false;
    const playerRadius = p.playerMesh.geometry.boundingSphere.radius || 0;

    if (p.playerMesh.position.distanceTo(asteroid.position) < rad + playerRadius) {
        if (!p.isInvulnerable && p.ready) {
            return true;
        }
    }
    return false;
}

/**
 * Checks for collisions between players and asteroids.
 */
function checkPlayerAsteroidCollisions() {
    asteroidGroup.children.forEach((asteroid) => {
        if (asteroid.geometry.boundingSphere === null) {
            //asteroid.geometry.computeBoundingSphere();
            return;
        }
        if (player.playerMesh.geometry.boundingSphere === null && player.ready) {
            //player.geometry.computeBoundingSphere();
            return;
        }
        const asteroidRadius = asteroid.geometry.boundingSphere.radius;
        let collisionBuffer = [];

        let status = checkAsteroidCollision(asteroid, asteroidRadius, player);
        if (status) {
            collisionBuffer.push(player);
        }

        for (let [key, playerData] of players) {
            let status = checkAsteroidCollision(asteroid, asteroidRadius, playerData);
            if (status) {
                collisionBuffer.push(playerData);
            }
        }

        if (collisionBuffer.length > 0) {
            let randomIndex = Math.floor(Math.random() * collisionBuffer.length);
            destroyPlayer(collisionBuffer[randomIndex], asteroid);
        }
    });
    document.getElementById('dbgInvul').innerText = 'Invulnerable time: ' + player.invulnerableTimePassed;
}

/**
 * Destroys the player and handles their life count and respawn.
 * @param {Object} p - The player object to destroy.
 * @param {THREE.Mesh} as - The asteroid that collides with the player.
 */
function destroyPlayer(p, as) {
    p.lives--;
    updateLivesDisplay();
    explodeAsteroid(as, p);
    try {
        const gamepad = navigator.getGamepads()[p.gamepadIndex];
        gamepad.vibrationActuator.playEffect("dual-rumble", {
            startDelay: 0,
            duration: 200,
            weakMagnitude: 1.0,
            strongMagnitude: 1.0,
        });
    } catch (e) {
        /* probable error */
    }

    if (p.lives <= 0) {
        endGame();
    } else {
        p.isInvulnerable = true;
        p.invulnerablePhase.reset();
        createNewParticles(p.playerMesh.position, 3, partyMode);
        p.playerMesh.position.set(0, 0, 0);
        p.playerMesh.material.color.set(0xFFD700); // Gold color
        p.velocity.set(0, 0, 0);
    }
}

/**
 * Checks if all asteroids have been cleared; if so, advances the level.
 */
function checkAsteroidsCleared() {
    if (asteroidGroup.children.length === 0) {
        level++;
        addAsteroids(3, level + 3);
        Saucer.spawnRandomly(scene, pickRandomPlayer(), 'models/saucer.obj');
    }
}

/**
 * Checks for collisions between bullets and asteroids.
 */
function checkBulletAsteroidCollisions() {
    function filterBullets(bullet, owner) {
        let hit = false;
        asteroidGroup.children.forEach((asteroid) => {
            if (asteroid.geometry.boundingSphere !== null &&
                bullet.mesh.position.distanceTo(asteroid.position) < asteroid.geometry.boundingSphere.radius && !hit) {
                explodeAsteroid(asteroid, owner);
                hit = true;
            }
        });
        if (hit) {
            bullet.life = 0;
            scene.remove(bullet.mesh);
            scene.remove(bullet.light);
        }
        return !hit;
    }

    player.bullets = player.bullets.filter((bullet) => {
        return filterBullets(bullet, player);
    });
    players.forEach((cPlayer) => {
        cPlayer.bullets.filter((bullet) => {
            return filterBullets(bullet, cPlayer);
        });
    });
    updateScoreDisplay();
}

/**
 * Picks a random player from the game.
 * @returns {Player} - The randomly selected player.
 */
function pickRandomPlayer() {
    // Combine the player object with the values from the Map
    const allPlayers = [player, ...Array.from(players.values()).filter(player => player.ready === true)];

    // If the map is empty, default to the player
    if (players.size === 0) {
        return player;
    }

    // Randomly pick an index from the combined array
    const randomIndex = Math.floor(Math.random() * allPlayers.length);

    // Return the randomly picked player
    return allPlayers[randomIndex];
}

/**
 * Freezes the movement of all asteroids in the game.
 */
function freezeAsteroids() {
    asteroidGroup.children.forEach((asteroid) => {
        asteroid.velocity.set(0, 0, 0);
    });
}

/**
 * Checks for collisions between particles and asteroids and alters the asteroid's course.
 * @param {Object} ptl - The particle to check collision for.
 */
function checkParticleAsteroidCollisions(ptl) {
    asteroidGroup.children.forEach((asteroid) => {
        if (asteroid.geometry.boundingSphere === null) {
            asteroid.geometry.computeBoundingSphere();
        }
        const asteroidRadius = asteroid.geometry.boundingSphere.radius;

        if (ptl.position.distanceTo(asteroid.position) < asteroidRadius) {
            alterAsteroidCourse(asteroid, ptl.velocity);
        }
    });
}

/**
 * Alters the course of an asteroid with a given force.
 * @param {THREE.Mesh} asteroid - The asteroid to alter.
 * @param {THREE.Vector3} force - The force to apply.
 */
function alterAsteroidCourse(asteroid, force) {
    if (!asteroid.velocity) {
        asteroid.velocity = new THREE.Vector3();
    }
    asteroid.velocity.add(force.clone().multiplyScalar(0.001));
}

/**
 * Updates the positions and states of all bullets.
 * @param {number} d - The time elapsed since the last frame.
 */
function updateBullets(d) {
    // private function to check bullets
    function checkBullets(bullet, index, bulletsArray) {
        bullet.life -= d;

        if (bullet.life <= 0) {
            scene.remove(bullet.mesh);
            scene.remove(bullet.light);
            bulletsArray.splice(index, 1);
            return;
        }
        bullet.mesh.position.add(bullet.mesh.velocity);
        bullet.light.position.add(bullet.mesh.velocity);
        wrapPosition(bullet.mesh);
        wrapPosition(bullet.light);
    }

    player.bullets.forEach((bullet, index) => {
        checkBullets(bullet, index, player.bullets);
    });

    players.forEach((p) => {
        p.bullets.forEach((bullet, index) => {
            checkBullets(bullet, index, p.bullets);
        });
    });
}

/**
 * Wraps the position of an object within the game field boundaries.
 * @param {THREE.Object3D} obj - The object to wrap position for.
 */
function wrapPosition(obj) {
    obj.position.x = THREE.MathUtils.euclideanModulo(obj.position.x + 10, 20) - 10;
    obj.position.y = THREE.MathUtils.euclideanModulo(obj.position.y + 10, 20) - 10;
}

/**
 * Warps the player to a random position within the play field bounds.
 * @param {Player} p - The player object to warp.
 */
function warpPlayer(p) {
    const playFieldBounds = {
        xMin: -8,
        xMax: 8,
        yMin: -8,
        yMax: 8
    };

    const randomX = Math.random() * (playFieldBounds.xMax - playFieldBounds.xMin) + playFieldBounds.xMin;
    const randomY = Math.random() * (playFieldBounds.yMax - playFieldBounds.yMin) + playFieldBounds.yMin;

    if (p.gamepadIndex !== null) {
        players.forEach((p) => {
            if (p === p) {
                p.playerMesh.position.set(randomX, randomY, 0);
                p.warpDelay = 0;
            }
        });
    } else {
        player.playerMesh.position.set(randomX, randomY, 0);
        player.warpDelay = 0;
    }
    playSound(warpSound);
}

/**
 * Updates the positions and rotations of all asteroids.
 * @param {number} delta - The time elapsed since the last frame.
 */
function updateAsteroids(delta) {
    asteroidGroup.children.forEach((asteroid) => {
        asteroid.position.add(asteroid.velocity);
        wrapPosition(asteroid);
        asteroid.rotation.x += asteroid.rotationSpeed.x * delta;
        asteroid.rotation.y += asteroid.rotationSpeed.y * delta;
        asteroid.rotation.z += asteroid.rotationSpeed.z * delta;
    });
}

/**
 * Main animation loop that updates game elements and renders the scene.
 */
function animate() {
    if (endScreen) return;
    const d = clock.getDelta(); // Time since last frame

    document.getElementById("fps").innerText = "FPS:" + Math.floor(1 / d);
    starField.material.uniforms.time.value += d;

    // Update saucer position
    if (saucer) {
        saucer.bullets.forEach(bullet => bullet.update(d));
        saucer.update(d, clock.getElapsedTime() * 1000);
    }

    //players.forEach(p => {}); // template
    handleGamepadInput(d);
    updateAsteroids(d);
    updateBullets(d);
    updateParticles(d);
    updateThrustLights(d);
    checkBulletAsteroidCollisions();
    checkPlayerAsteroidCollisions();
    checkAsteroidsCleared();
    updateKBPlayer(d);
    checkMusic();

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}