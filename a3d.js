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
let playerModel, pmUrl = "a-tri.obj";

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
loadSound('ready.mp3').then(buffer => readySound = buffer);
loadSound('laser.mp3').then(buffer => shootingSound = buffer);
loadSound('explosion.mp3').then(buffer => explosionSound = buffer);
loadSound('warp.mp3').then(buffer => warpSound = buffer);

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

// Function to update the player's score display
function updatePlayerScoreDisplay(index, count) {
    document.getElementById('player' + index + 'Score').innerText = 'P' + (index + 1) + ' Score: ' + count;
}

function updatePlayerLivesDisplay(index, count) {
    let ll = players.get(index).lives;
    let ld = ll <= 0 ? 0 : ll - 1;
    document.getElementById('player' + index + 'Lives').innerText = 'P' + (index + 1) + ' Lives: ' + ld;
}

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

function screenLoop() {
    const delta = clock.getDelta();
    handleGamepadInput(delta);
    updateKBPlayer(delta);
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

function loadSound(url) {
    return fetch(url)
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer));
}

function playSound(buffer) {
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start();
}

function startGame() {
    document.getElementById('startScreen').style.display = 'none';
    if (startScreen) {
        document.querySelector("body > midi-player").shadowRoot.querySelector("div > button").click();
        startScreen = false;
    }
    init();
}

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
    Saucer.spawnRandomly(scene, pickRandomPlayer(), 'saucer.obj');

    setupStarField();
    setupLighting();
    setupAsteroids();
    setupEventListeners();
    updateScoreDisplay();
    updateLivesDisplay();
    animate();
}

function setupCamera() {
    const aspectRatio = window.innerWidth / window.innerHeight;
    const viewSize = 20;
    const cameraWidth = viewSize * aspectRatio;
    const cameraHeight = viewSize;
    camera = new THREE.OrthographicCamera(
        cameraWidth / -2, cameraWidth / 2, cameraHeight / 2, cameraHeight / -2, 1, 2000);
    camera.position.z = 50;
}

function setupRenderer() {
    if (!renderer) {
        renderer = new THREE.WebGLRenderer({
            antialias: true
        });
        document.body.appendChild(renderer.domElement);
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
}

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

function setupLighting() {
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 1, 5);
    scene.add(light);
}

function setupAsteroids() {
    asteroidGroup = new THREE.Group();
    particlesGroup = new THREE.Group();
    scene.add(asteroidGroup);
    scene.add(particlesGroup);
    addAsteroids(3, level + 2);
}

function setupEventListeners() {
    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateScoreDisplay() {
    document.getElementById('playerScore').innerText = 'Score: ' + player.score;
    players.forEach((player, key) => {
        updatePlayerScoreDisplay(key, player.score);
    });
}

function updateLivesDisplay() {
    let ld = player.lives <= 0 ? 0 : player.lives - 1;
    document.getElementById('playerLives').innerText = 'Lives left: ' + ld;
    players.forEach((p, key) => {
        updatePlayerLivesDisplay(key, p.lives);
    });
}

function addAsteroids(size, number, position) {
    const newAsteroids = [];
    const material = new THREE.MeshLambertMaterial({
        color: 0x8B4513
    });
    for (let i = 0; i < number; i++) {
        const geometry = getAsteroidGeometry(size);
        const asteroid = new THREE.Mesh(geometry, material);

        setPosition(asteroid, position);
        setVelocity(asteroid);
        setRotation(asteroid);

        asteroid.size = size;
        asteroidGroup.add(asteroid);
        newAsteroids.push(asteroid);
    }
    return newAsteroids;
}

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

function setPosition(asteroid, position) {
    if (!position) {
        const edge = Math.floor(Math.random() * 4);
        const pos = Math.random() * 20 - 10;
        switch (edge) {
            case 0:
                asteroid.position.set(pos, 10, 0);
                break;
            case 1:
                asteroid.position.set(10, pos, 0);
                break;
            case 2:
                asteroid.position.set(pos, -10, 0);
                break;
            case 3:
                asteroid.position.set(-10, pos, 0);
                break;
        }
    } else {
        asteroid.position.x = position.x + (Math.random() - 0.5) * 2;
        asteroid.position.y = position.y + (Math.random() - 0.5) * 2;
    }
}

function setVelocity(asteroid) {
    asteroid.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.1,
        0);
}

function setRotation(asteroid) {
    const upVector = new THREE.Vector3(0, 0, 1);
    asteroid.rotationAxis = new THREE.Vector3().crossVectors(asteroid.velocity, upVector).normalize();
    asteroid.rotationSpeedMagnitude = asteroid.velocity.length() * 0.05;
    asteroid.rotationSpeed = {
        x: (Math.random() < 0.5 ? 1 : -1) * (Math.random() * 0.05 + 0.5), // Random rotation along the x-axis
        y: (Math.random() < 0.5 ? 1 : -1) * (Math.random() * 0.05 + 0.5), // Random rotation along the y-axis
        z: 0, // Consistent spin in one direction along the z-axis
    };
}

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

function explodeAsteroid(asteroid, owner) {
    const velocityIncreaseFactor = 1.6;

    updateScore(asteroid.size, owner);

    if (asteroid.size > 1) {
        const newSize = asteroid.size - 1;
        const newAsteroids = addAsteroids(newSize, 2, asteroid.position);
        newAsteroids.forEach(newAsteroid => {
            newAsteroid.velocity.multiplyScalar(velocityIncreaseFactor);
        });
    }
    createNewParticles(asteroid.position, asteroid.size, partyMode);
    asteroidGroup.remove(asteroid);
    playSound(explosionSound);

    // Create a point light at the asteroid's position
    const explosionLight = new THREE.PointLight(0xffffff, 5, 20); // white light, intensity 1, distance 10
    explosionLight.position.copy(asteroid.position);
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

function createPlayerMesh(color) {
    const model = playerModel ?
        playerModel.children[0].geometry.clone().scale(0.05, 0.05, 0.05).clone() :
        new THREE.ConeGeometry(0.5, 1, 32);
    return new THREE.Mesh(model, new THREE.MeshPhongMaterial({
        color: color
    }))
}

function createThrustTrail(pl) {
    const particleCount = 3; // Number of particles to create for each thrust, adjust as needed
    const geometry = new THREE.SphereGeometry(0.05, 6, 6); // Smaller geometry for particles
    const material = new THREE.MeshBasicMaterial({
        color: 0xff6600
    }); // Orange color for the thrust

    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(geometry, material);

        // Position the particles at the base of the cone
        let offset = new THREE.Vector3(0, -0.75, 0); // Adjust the offset as needed
        offset.applyQuaternion(pl.playerMesh.quaternion);
        particle.position.set(pl.playerMesh.position.x + offset.x,
            pl.playerMesh.position.y + offset.y, 0);

        // Give the particles an initial velocity with reduced spread
        let velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.2, // Reduce the randomness in x component
            -0.5 - Math.random() * 0.1, // Make y component more consistent and downward
            0 // Reduce the randomness in z component
        ); //.normalize().multiplyScalar(0.5); // Adjust the scalar as needed
        velocity.applyQuaternion(pl.playerMesh.quaternion);

        particle.life = 0.5; // Particle lifetime in seconds
        particle.velocity = velocity; // Set particle velocity and lifetime

        particlesGroup.add(particle);
        thrustParticles.push(particle); // Add to the array of thrust particles
    }

    const offset = new THREE.Vector3(0, -0.75, 0);
    const thrustLight = new THREE.PointLight(0xff6600, 1, 5);
    thrustLight.position.set(pl.playerMesh.position.x + offset.x,
        pl.playerMesh.position.y + offset.y,
        0);
    thrustLight.life = 0.3; // Set light life to 300ms

    scene.add(thrustLight);
    thrustLights.push(thrustLight);
}

function updateThrustLights(deltaTime) {
    thrustLights = thrustLights.filter((light) => {
        light.life -= deltaTime;
        if (light.life <= 0) {
            scene.remove(light);
            return false;
        }
        return true;
    });
}

function shoot(cPlayer) {
    // Check if there are already 3 bullets, exit if so
    if (cPlayer !== null) {
        if (cPlayer.bullets.length >= 3) {
            return;
        }
    }

    if (cPlayer === null || cPlayer === undefined) {
        console.error("shoot() got NULL player")
    }

    // Get the elapsed time since the last shot
    const elapsedTime = cPlayer.shotClock.getElapsedTime();

    // Check if enough time has passed since the last shot
    if (elapsedTime < shotDelay) {
        return; // Delay not met, exit the function
    }

    // Reset the clock for the next shot
    cPlayer.shotClock.start();

    const bulletMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 8),
        new THREE.MeshPhongMaterial({
            color: 0xff0000
        }));
    let offset = new THREE.Vector3(0, 1, 0);
    offset.applyQuaternion(cPlayer.playerMesh.quaternion);
    bulletMesh.position.set(cPlayer.playerMesh.position.x + offset.x,
        cPlayer.playerMesh.position.y + offset.y,
        cPlayer.playerMesh.position.z + offset.z);

    let velocity = new THREE.Vector3(0, 0.5, 0);
    velocity.applyQuaternion(cPlayer.playerMesh.quaternion);
    bulletMesh.velocity = velocity;

    // Create a point light and attach it to the bullet
    let bulletLight = new THREE.PointLight(0xff0000, 2, 10); // Parameters: color, intensity, distance
    bulletLight.position.set(bulletMesh.position.x, bulletMesh.position.y, bulletMesh.position.z);

    bulletMesh.add(bulletLight); // Attach the light to the bullet
    cPlayer.bullets.push({
        mesh: bulletMesh,
        light: bulletLight,
        life: 0.38
    }); // Add the bullet to the bullets array

    scene.add(bulletLight);
    scene.add(bulletMesh);
    playSound(shootingSound);
}

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

function checkAsteroidCollision(asteroid, asteroidRadius, p) {
    if (p === null || p === player) {
        p = player;
    }
    if (p.playerMesh.geometry.boundingSphere === null || !p.ready)
        return false;
    const playerRadius = p.playerMesh.geometry.boundingSphere.radius || 0;

    if (p.playerMesh.position.distanceTo(asteroid.position) < asteroidRadius + playerRadius) {
        if (!p.isInvulnerable && p.ready) {
            p.lives--;
            updateLivesDisplay();
            explodeAsteroid(asteroid, p);
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
        return true;
    }
    return false;
}

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
        let status = checkAsteroidCollision(asteroid, asteroidRadius, player);
        if (!status) {
            for (let [key, playerData] of players) {
                let status = checkAsteroidCollision(asteroid, asteroidRadius, playerData);
                if (status)
                    break;
            }
        }
    });
    document.getElementById('dbgInvul').innerText = 'Invulnerable time: ' + player.invulnerableTimePassed;
}

function checkAsteroidsCleared() {
    if (asteroidGroup.children.length === 0) {
        level++;
        addAsteroids(3, level + 3);
        Saucer.spawnRandomly(scene, pickRandomPlayer(), 'saucer.obj');
    }
}

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

// Function to pick a random player
function pickRandomPlayer() {
    // Combine the player object with the values from the Map
    const allPlayers = [player, ...players.values().filter(player => player.ready === true)];

    // If the map is empty, default to the player
    if (players.size === 0) {
        return player;
    }

    // Randomly pick an index from the combined array
    const randomIndex = Math.floor(Math.random() * allPlayers.length);

    // Return the randomly picked player
    return allPlayers[randomIndex];
}

function freezeAsteroids() {
    asteroidGroup.children.forEach((asteroid) => {
        asteroid.velocity.set(0, 0, 0);
    });
}

function checkParticleAsteroidCollisions(particle) {
    asteroidGroup.children.forEach((asteroid) => {
        if (asteroid.geometry.boundingSphere === null) {
            asteroid.geometry.computeBoundingSphere();
        }
        const asteroidRadius = asteroid.geometry.boundingSphere.radius;

        if (particle.position.distanceTo(asteroid.position) < asteroidRadius) {
            alterAsteroidCourse(asteroid, particle.velocity);
        }
    });
}

function alterAsteroidCourse(asteroid, force) {
    if (!asteroid.velocity) {
        asteroid.velocity = new THREE.Vector3();
    }
    asteroid.velocity.add(force.clone().multiplyScalar(0.001));
}

function updateBullets(deltaTime) {
    // private function to check bullets
    function checkBullets(bullet, index, bulletsArray) {
        bullet.life -= deltaTime;

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

function wrapPosition(object) {
    object.position.x = THREE.MathUtils.euclideanModulo(object.position.x + 10, 20) - 10;
    object.position.y = THREE.MathUtils.euclideanModulo(object.position.y + 10, 20) - 10;
}

function warpPlayer(pl) {
    const playFieldBounds = {
        xMin: -8,
        xMax: 8,
        yMin: -8,
        yMax: 8
    };

    const randomX = Math.random() * (playFieldBounds.xMax - playFieldBounds.xMin) + playFieldBounds.xMin;
    const randomY = Math.random() * (playFieldBounds.yMax - playFieldBounds.yMin) + playFieldBounds.yMin;

    if (pl.gamepadIndex !== null) {
        players.forEach((p) => {
            if (pl === p) {
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

function updateAsteroids(deltaTime) {
    asteroidGroup.children.forEach((asteroid) => {
        asteroid.position.add(asteroid.velocity);
        wrapPosition(asteroid);
        asteroid.rotation.x += asteroid.rotationSpeed.x * deltaTime;
        asteroid.rotation.y += asteroid.rotationSpeed.y * deltaTime;
        asteroid.rotation.z += asteroid.rotationSpeed.z * deltaTime;
    });
}

function animate() {
    if (endScreen) return;
    const deltaTime = clock.getDelta(); // Time since last frame

    document.getElementById("fps").innerText = "FPS:" + Math.floor(1 / deltaTime);
    starField.material.uniforms.time.value += deltaTime;

    // Update saucer position
    if (saucer) {
        saucer.bullets.forEach(bullet => bullet.update(deltaTime));
        saucer.update(deltaTime, clock.getElapsedTime() * 1000);
    }

    //players.forEach(p => {}); // template
    handleGamepadInput(deltaTime);
    updateAsteroids(deltaTime);
    updateBullets(deltaTime);
    updateParticles(deltaTime);
    updateThrustLights(deltaTime);
    checkBulletAsteroidCollisions();
    checkPlayerAsteroidCollisions();
    checkAsteroidsCleared();
    updateKBPlayer(deltaTime);
    checkMusic();

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}