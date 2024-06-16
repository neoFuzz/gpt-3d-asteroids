// TODO: fix layering issue. where players explode 1 through 4, player 4 can never die.
// implement analogue stick control
class Player {
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

function setupPlayer(pl) {
    const sequence = generateSpiralSequence(12);
    if (pl !== null) {
        if (!pl.ready) {
            const plstring = "player" + (pl.gamepadIndex === null ? "" : pl.gamepadIndex);
            document.getElementById(plstring + "Score").style.display = "none";
            document.getElementById(plstring + "Lives").style.display = "none";
            return;
        }
        let playerIndex = players.get(pl.gamepadIndex);

        if (playerIndex === undefined && pl.gamepadIndex !== null) {
            console.log(`Player ${pl.gamepadIndex} missing`);
            return;
        }
        if (pl.playerMesh === null || pl.playerMesh === undefined)
            pl.playerMesh = createPlayerMesh(pl.mainColor)
        pl.playerMesh.position.set(sequence[pl.gamepadIndex + 1][0], sequence[pl.gamepadIndex + 1][1], 0);
        pl.playerMesh.rotation.set(0, 0, 0);
        pl.playerMesh.name = "player" + (pl.gamepadIndex !== null ? pl.gamepadIndex : "");
        pl.velocity.set(0, 0, 0);
        pl.lives = 3;
        pl.score = 0;
        pl.livesGranted = 0;
        pl.warpDelay = 0.9; // can't be >= 1

        const pg = "player" + (pl.gamepadIndex !== null ? pl.gamepadIndex : "");
        document.getElementById(pg + "Score").style.display = "flex";
        document.getElementById(pg + "Lives").style.display = "flex";
        //document.getElementById(pg + "Score").style.display = "flex";
        try {
            const dc = "#" + pl.mainColor.getHexString();
            document.getElementById(pg + "Lives").style.color = dc;
            document.getElementById(pg + "Score").style.color = dc;
        } catch (e) {
            document.getElementById(pg + "Lives").style.color = "#00FF00";
            document.getElementById(pg + "Score").style.color = "#00FF00";
        }

        if (scene !== undefined) scene.add(pl.playerMesh);
        updateScoreDisplay();
        updateLivesDisplay();
    } else {
        console.error("setupPlayer error: NULL error");
    }
}

// Function to handle gamepad input
function handleGamepadInput(delta) {
    players.forEach((cPlayer) => {
        const playerGPI = cPlayer.gamepadIndex;
        const gamepad = navigator.getGamepads()[playerGPI];
        if (gamepad) {
            const isFireButtonPressed = gamepad.buttons[0].pressed;
            const isMenuButtonPressed = gamepad.buttons[9].pressed; //  use `start` key
            const elapsedTime = cPlayer.shotClock.getElapsedTime();

            if (startScreen || endScreen) {
                if (cPlayer.ready && elapsedTime > 1 && isFireButtonPressed) {
                    if (startScreen) {
                        startGame();
                    } else if (endScreen) {
                        restartGame();
                    }
                    return;
                } else if (!cPlayer.ready && isMenuButtonPressed && elapsedTime > 1) {
                    playSound(readySound);
                    cPlayer.ready = true;
                    cPlayer.shotClock.start();
                    document.getElementById("player" + playerGPI).innerText = "Player " + (playerGPI + 1) + " Ready";
                    document.getElementById("player" + playerGPI).style.color = "green";
                }
                return;
            }
            if ((!startScreen || !endScreen) && !cPlayer.ready && isMenuButtonPressed) {
                cPlayer.ready = true;
                playSound(readySound);
                setupPlayer(cPlayer);
            }
            if (startScreen || endScreen || !cPlayer.ready) return;

            const isWarpButtonPressed = gamepad.buttons[1].pressed;
            const isUpPressed = gamepad.buttons[12].pressed;
            const isDownPressed = gamepad.buttons[13].pressed;
            const isLeftPressed = gamepad.buttons[14].pressed;
            const isRightPressed = gamepad.buttons[15].pressed;

            if (isWarpButtonPressed && !keysPressed['gamepadWarp' + playerGPI]) {
                keysPressed['gamepadWarp' + playerGPI] = true;
                if (cPlayer.warpDelay >= 1) warpPlayer(cPlayer);
            } else if (!isWarpButtonPressed) {
                keysPressed['gamepadWarp' + playerGPI] = false;
            }

            if (isFireButtonPressed) {
                keysPressed['gamepadFire' + playerGPI] = true;
                shoot(cPlayer);
            } else if (!isFireButtonPressed) {
                keysPressed['gamepadFire' + playerGPI] = false;
            }

            if (isDownPressed) {
                keysPressed['gamepadDown' + playerGPI] = true;
                cPlayer.velocity.multiplyScalar(0.95)
            } else if (!isDownPressed) {
                keysPressed['gamepadDown' + playerGPI] = false;
            }

            if (isLeftPressed) {
                keysPressed['gamepadLeft' + playerGPI] = true;
                cPlayer.playerMesh.rotation.z += cPlayer.rotationSpeed;
            } else if (!isLeftPressed) {
                keysPressed['gamepadLeft' + playerGPI] = false;
            }

            if (isRightPressed) {
                keysPressed['gamepadRight' + playerGPI] = true;
                cPlayer.playerMesh.rotation.z -= cPlayer.rotationSpeed;
            } else if (!isRightPressed) {
                keysPressed['gamepadRight' + playerGPI] = false;
            }

            // Handle movement with analogue stick
            const axisX = gamepad.axes[0]; // Left stick horizontal
            const axisY = gamepad.axes[1]; // Left stick vertical

            if (axisY < -0.1 || isUpPressed) { // Up for acceleration
                keysPressed['gamepadUp' + playerGPI] = true;
                const accelerationFactor = isUpPressed ? 1 : -axisY; // stick value or gamepad up
                cPlayer.velocity.x -= accelerationFactor * cPlayer.acceleration * Math.sin(cPlayer.playerMesh.rotation.z);
                cPlayer.velocity.y += accelerationFactor * cPlayer.acceleration * Math.cos(cPlayer.playerMesh.rotation.z);
                createThrustTrail(cPlayer);
            } else {
                keysPressed['gamepadUp' + playerGPI] = false;
            }

            if (axisY > 0.1) { // Down for brakes
                keysPressed['gamepadDown' + playerGPI] = true;
                cPlayer.velocity.multiplyScalar(1 - (axisY * 0.05)); // Apply brakes proportional to stick deflection
            } else {
                keysPressed['gamepadDown' + playerGPI] = false;
            }

            if (Math.abs(axisX) > 0.1) { // Left and right for rotation
                keysPressed['gamepadLeft' + playerGPI] = axisX < 0;
                keysPressed['gamepadRight' + playerGPI] = axisX > 0;
                cPlayer.playerMesh.rotation.z -= axisX * cPlayer.rotationSpeed;
            } else {
                keysPressed['gamepadLeft' + playerGPI] = false;
                keysPressed['gamepadRight' + playerGPI] = false;
            }

            // Update player position based on velocity
            cPlayer.playerMesh.position.add(cPlayer.velocity);
            updatePlayerScoreDisplay(playerGPI, cPlayer.score);
            wrapPosition(cPlayer.playerMesh);
            if (cPlayer.isInvulnerable) {
                cPlayer.invulnerableTimePassed += (clock.getDelta() * 100);
                cPlayer.playerMesh.visible = Math.floor(cPlayer.invulnerableTimePassed / blinkDuration) % 2 === 0;
            }
            if (cPlayer.warpDelay <= 1) {
                cPlayer.playerMesh.visible = Math.floor(cPlayer.warpDelay / blinkDuration) % 2 === 0;
            }
            cPlayer.warpDelay += delta;
        }
    });
}

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