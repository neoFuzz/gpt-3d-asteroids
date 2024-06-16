/**
 * Class representing a Player.
 */
class Player {
    /**
     * Create a player.
     * @param {THREE.Color} color - The color of the player.
     * @param {number} gamepadIndex - The index of the gamepad associated with the player.
     */
    constructor(color, gamepadIndex) {
        this.color = color;
        this.gamepadIndex = gamepadIndex;
        this.velocity = new THREE.Vector3();
        this.rotationSpeed = 0.1;
        this.acceleration = 0.013;
        this.mainColor = color;
        this.playerMesh = createPlayerMesh(color);
        this.score = 0;
        this.isInvulnerable = false;
        this.invulnerablePhase = null;
        this.warpDelay = 0.5;
        this.lives = 0;
        this.bullets = [];
        this.livesGranted = 0;
        this.ready = false;
        this.shotClock = new THREE.Clock();
    }
}

/**
 * Set up a player for the game.
 * @param {Player} p - The player to set up.
 */
function setupPlayer(p) {
    const sequence = generateSpiralSequence(12);
    if (p !== null) {
        if (!p.ready) {
            const plstring = "player" + (p.gamepadIndex === null ? "" : p.gamepadIndex);
            document.getElementById(plstring + "Score").style.display = "none";
            document.getElementById(plstring + "Lives").style.display = "none";
            return;
        }
        let playerIndex = players.get(p.gamepadIndex);

        if (playerIndex === undefined && p.gamepadIndex !== null) {
            console.log(`Player ${p.gamepadIndex} missing`);
            return;
        }
        if (p.playerMesh === null || p.playerMesh === undefined)
            p.playerMesh = createPlayerMesh(p.mainColor)
        p.playerMesh.position.set(
            (p.gamepadIndex !== null ? sequence[p.gamepadIndex + 1][0] : 0),
            (p.gamepadIndex !== null ? sequence[p.gamepadIndex + 1][1] : 0), 0);
        p.playerMesh.rotation.set(0, 0, 0);
        p.playerMesh.name = "player" + (p.gamepadIndex !== null ? p.gamepadIndex : "");
        p.velocity.set(0, 0, 0);
        p.lives = 3;
        p.score = 0;
        p.livesGranted = 0;
        p.warpDelay = 0.9; // can't be >= 1

        const pg = "player" + (p.gamepadIndex !== null ? p.gamepadIndex : "");
        document.getElementById(pg + "Score").style.display = "flex";
        document.getElementById(pg + "Lives").style.display = "flex";
        //document.getElementById(pg + "Score").style.display = "flex";
        try {
            const dc = "#" + p.mainColor.getHexString();
            document.getElementById(pg + "Lives").style.color = dc;
            document.getElementById(pg + "Score").style.color = dc;
        } catch (e) {
            document.getElementById(pg + "Lives").style.color = "#00FF00";
            document.getElementById(pg + "Score").style.color = "#00FF00";
        }

        if (scene !== undefined) scene.add(p.playerMesh);
        updateScoreDisplay();
        updateLivesDisplay();
    } else {
        console.error("setupPlayer error: NULL error");
    }
}

/**
 * Handle gamepad input.
 * @param {number} delta - The time elapsed since the last frame.
 */
function handleGamepadInput(delta) {
    players.forEach((p) => {
        const playerGPI = p.gamepadIndex;
        const gamepad = navigator.getGamepads()[playerGPI];
        if (gamepad) {
            const isFireButtonPressed = gamepad.buttons[0].pressed;
            const isMenuButtonPressed = gamepad.buttons[9].pressed; //  use `start` key
            const elapsedTime = p.shotClock.getElapsedTime();

            if (startScreen || endScreen) {
                if (p.ready && elapsedTime > 1 && isFireButtonPressed) {
                    if (startScreen) {
                        startGame();
                    } else if (endScreen) {
                        restartGame();
                    }
                    return;
                } else if (!p.ready && isMenuButtonPressed && elapsedTime > 1) {
                    playSound(readySound);
                    p.ready = true;
                    p.shotClock.start();
                    document.getElementById("player" + playerGPI).innerText = "Player " + (playerGPI + 1) + " Ready";
                    document.getElementById("player" + playerGPI).style.color = "green";
                }
                return;
            }
            if ((!startScreen || !endScreen) && !p.ready && isMenuButtonPressed) {
                p.ready = true;
                playSound(readySound);
                setupPlayer(p);
            }
            if (startScreen || endScreen || !p.ready) return;

            const isWarpButtonPressed = gamepad.buttons[1].pressed;
            const isUpPressed = gamepad.buttons[12].pressed;
            const isDownPressed = gamepad.buttons[13].pressed;
            const isLeftPressed = gamepad.buttons[14].pressed;
            const isRightPressed = gamepad.buttons[15].pressed;

            if (isWarpButtonPressed && !keysPressed['gamepadWarp' + playerGPI]) {
                keysPressed['gamepadWarp' + playerGPI] = true;
                if (p.warpDelay >= 1) warpPlayer(p);
            } else if (!isWarpButtonPressed) {
                keysPressed['gamepadWarp' + playerGPI] = false;
            }

            if (isFireButtonPressed) {
                keysPressed['gamepadFire' + playerGPI] = true;
                shoot(p);
            } else if (!isFireButtonPressed) {
                keysPressed['gamepadFire' + playerGPI] = false;
            }

            if (isDownPressed) {
                keysPressed['gamepadDown' + playerGPI] = true;
                p.velocity.multiplyScalar(0.95)
            } else if (!isDownPressed) {
                keysPressed['gamepadDown' + playerGPI] = false;
            }

            if (isLeftPressed) {
                keysPressed['gamepadLeft' + playerGPI] = true;
                p.playerMesh.rotation.z += p.rotationSpeed;
            } else if (!isLeftPressed) {
                keysPressed['gamepadLeft' + playerGPI] = false;
            }

            if (isRightPressed) {
                keysPressed['gamepadRight' + playerGPI] = true;
                p.playerMesh.rotation.z -= p.rotationSpeed;
            } else if (!isRightPressed) {
                keysPressed['gamepadRight' + playerGPI] = false;
            }

            // Handle movement with analogue stick
            const axisX = gamepad.axes[0]; // Left stick horizontal
            const axisY = gamepad.axes[1]; // Left stick vertical

            if (axisY < -0.1 || isUpPressed) { // Up for acceleration
                keysPressed['gamepadUp' + playerGPI] = true;
                const accelerationFactor = isUpPressed ? 1 : -axisY; // stick value or gamepad up
                p.velocity.x -= accelerationFactor * p.acceleration * Math.sin(p.playerMesh.rotation.z);
                p.velocity.y += accelerationFactor * p.acceleration * Math.cos(p.playerMesh.rotation.z);
                createThrustTrail(p);
            } else {
                keysPressed['gamepadUp' + playerGPI] = false;
            }

            if (axisY > 0.1) { // Down for brakes
                keysPressed['gamepadDown' + playerGPI] = true;
                p.velocity.multiplyScalar(1 - (axisY * 0.05)); // Apply brakes proportional to stick deflection
            } else {
                keysPressed['gamepadDown' + playerGPI] = false;
            }

            if (Math.abs(axisX) > 0.1) { // Left and right for rotation
                keysPressed['gamepadLeft' + playerGPI] = axisX < 0;
                keysPressed['gamepadRight' + playerGPI] = axisX > 0;
                p.playerMesh.rotation.z -= axisX * p.rotationSpeed;
            } else {
                keysPressed['gamepadLeft' + playerGPI] = false;
                keysPressed['gamepadRight' + playerGPI] = false;
            }

            // Update player position based on velocity
            p.playerMesh.position.add(p.velocity);
            updatePlayerScoreDisplay(playerGPI, p.score);
            wrapPosition(p.playerMesh);
            if (p.isInvulnerable) {
                p.invulnerableTimePassed += (clock.getDelta() * 100);
                p.playerMesh.visible = Math.floor(p.invulnerableTimePassed / blinkDuration) % 2 === 0;
            }
            if (p.warpDelay <= 1) {
                p.playerMesh.visible = Math.floor(p.warpDelay / blinkDuration) % 2 === 0;
            }
            p.warpDelay += delta;
        }
    });
}

/**
 * Update the keyboard player's actions based on input.
 * @param {number} delta - The time elapsed since the last frame.
 */
function updateKBPlayer(delta) {
    const elapsedTime = player.shotClock.getElapsedTime();
    if ((startScreen || endScreen)) {
        if (player.ready && elapsedTime > 1 && keysPressed[' ']) {
            if (startScreen) {
                startGame();
            } else if (endScreen) {
                restartGame();
            }
            return;
        }
    }
    if (keysPressed['Enter'] && !player.ready) {
        keysPressed['Enter'] = false;
        playSound(readySound);
        player.ready = true;
        player.shotClock.start();
        document.getElementById("player").innerText = "KB Player Ready";
        document.getElementById("player").style.color = "green";
        setupPlayer(player);
    }
    if (startScreen || endScreen || !player.ready)
        return;
    if (keysPressed['ArrowUp']) {
        // Up arrow key, accelerate
        player.velocity.x -= player.acceleration * Math.sin(player.playerMesh.rotation.z);
        player.velocity.y += player.acceleration * Math.cos(player.playerMesh.rotation.z);
        createThrustTrail(player);
    }
    if (keysPressed['ArrowDown'])
        player.velocity.multiplyScalar(0.95);
    if (keysPressed['ArrowLeft'])
        player.playerMesh.rotation.z += player.rotationSpeed;
    if (keysPressed['ArrowRight'])
        player.playerMesh.rotation.z -= player.rotationSpeed;
    if (keysPressed[' '])
        shoot(player);
    if (keysPressed['c'])
        partyMode = !partyMode;
    if (keysPressed['Control'] && player.warpDelay >= 1 /* cooldown time */) {
        warpPlayer(player);
    }
    if (keysPressed['d']) {
        debugMode = !debugMode;
        document.getElementById("debug").style.display = debugMode ? "flex" : "none";
    }
    if (keysPressed['f'] && debugMode) {
        freezeAsteroids();
    }
    if (keysPressed['i'] && debugMode) {
        player.isInvulnerable = !player.isInvulnerable;
    }
    player.playerMesh.position.add(player.velocity);
    player.velocity.clampLength(0, maxSpeed);
    wrapPosition(player.playerMesh);
    player.warpDelay += delta;

    if (player.isInvulnerable) {
        player.invulnerableTimePassed += (clock.getDelta() * 100);
        player.playerMesh.visible = Math.floor(player.invulnerableTimePassed / blinkDuration) % 2 === 0;
    }
    if (player.warpDelay <= 1) {
        player.playerMesh.visible = Math.floor(player.warpDelay / blinkDuration) % 2 === 0;
    }
    document.getElementById('dbgMisc').innerText =
        `visible: ${player.playerMesh.visible} | isInvulnerable: ${player.isInvulnerable}`;
}