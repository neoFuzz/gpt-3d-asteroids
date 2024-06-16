class Saucer {
    constructor(scene, player, modelPath) {
        this.scene = scene;
        this.player = player;
        this.position = this.getRandomEdgePosition();
        this.velocity = new THREE.Vector3((this.position.x > 0 ? -1 : 1), 0.01, 0); // Initial velocity
        this.modelPath = modelPath;
        this.model = null;
        this.shootInterval = 2000; // Shoot every 2 seconds
        this.lastShootTime = 0;
        this.bullets = [];
        this.alive = true;
        this.light = null;

        this.loadModel();
    }

    getRandomEdgePosition() {
        const edge = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
        const x = (edge === 1) ? 9 : (edge === 3) ? -9 : Math.random() * 9 - 9;
        const y = (edge === 0) ? 8 : (edge === 2) ? -8 : Math.random() * 8 - 8;
        return new THREE.Vector3(x, y, 0);
    }

    loadModel() {
        const objLoader = new THREE.OBJLoader();
        this.loadOBJ(objLoader);
    }

    loadOBJ(objLoader) {
        objLoader.load(this.modelPath, (object) => {
            this.model = object;
            this.model.position.copy(this.position);
            this.model.scale.set(0.15, 0.15, 0.15);
            this.scene.add(this.model);
        });
    }

    update(delta, currentTime) {
        if (!this.model || saucer === null) {
            return;
        }  // Ensure the model is loaded
        let toRemove = false;

        // Remove saucer from scene when it goes off-screen
        if (this.position.x > 12 || this.position.x < -12 ||
            this.position.y > 12 || this.position.y < -12) {
            toRemove = true;
        }

        //remove bullets when saucer is null
        if (toRemove || !this.alive) {
            saucer.bullets.forEach(bullet => {
                scene.remove(bullet.model);
            });
            if (!this.alive) {
                createNewParticles(this.position, 3, partyMode);
                playSound(explosionSound);
            }
            this.scene.remove(this.model);
            this.scene.remove(this.light);
            console.log(this.alive ? "saucer de-spawned!" : "saucer destroyed!");
            saucer = null;
            return;
        }

        // check if player bullet impact
        this.checkPlayerBulletCollisions();

        // Move in a zig-zag pattern
        this.position.x += this.velocity.x * delta;
        this.position.y += Math.sin(currentTime / 1000) * 0.05; // Adjust for zig-zag pattern
        this.model.position.copy(this.position);
        this.model.rotation.y += 2 * delta;
        this.light.position.set(saucer.position.x, saucer.position.y + 0.5, 0);

        // Shoot at the player
        if (currentTime - this.lastShootTime > this.shootInterval && this.bullets.length < 2) {
            this.shoot();
            this.lastShootTime = currentTime;
        }
    }

    shoot() {
        const direction = new THREE.Vector3().subVectors(this.player.playerMesh.position, this.position).normalize();
        // Add some inaccuracy based on the level
        const maxInaccuracy = 1; // Maximum inaccuracy at level 1
        const minInaccuracy = 0; // Minimum inaccuracy at level 10
        const inaccuracy = Math.max(maxInaccuracy - (level - 1) * (maxInaccuracy / 9), minInaccuracy);
        direction.x += (Math.random() - 0.5) * inaccuracy;
        direction.y += (Math.random() - 0.5) * inaccuracy;

        // Create a new projectile
        const projectile = new Projectile(this.scene, this.position.clone(), direction);
        this.bullets.push(projectile);
        this.scene.add(projectile.model);
        playSound(shootingSound);
    }

    static explodeSaucer(p) {
        saucer.bullets.forEach(bullet => {
            scene.remove(bullet.model);
        });
        saucer.alive = false;
        p.score += 1000;
    }

    checkPlayerBulletCollisions() {
        function filterBullets(bullet, owner) {
            let hit = false;
            const saucerRadius = 0.8;
            try {
                if (bullet.mesh.position.distanceTo(saucer.position) < saucerRadius && !hit) {
                    Saucer.explodeSaucer(owner);
                    hit = true;
                }
            } catch (e) {
                return !hit;
            }

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
        players.forEach((p) => {
            p.bullets = p.bullets.filter((bullet) => {
                return filterBullets(bullet, p);
            });
        });
        updateScoreDisplay();
    }

    static spawnRandomly(s, player, modelPath) {
        const spawnTime = Math.random() * (10000 - 5000) + 5000; // Random time between 0 and 10 seconds
        console.log(`Spawning saucer in ${spawnTime / 1000} seconds`);
        setTimeout(() => {
            saucer = new Saucer(s, player, modelPath);
            saucer.light = new THREE.PointLight(0xff00ff, 2, 10);
            saucer.light.position.set(saucer.position.x, saucer.position.y, saucer.position.z);
            s.add(saucer.light);
            console.log(`Saucer spawned! pos: x=${saucer.position.x} y=${saucer.position.y}`);
        }, spawnTime);
    }
}

class Projectile {
    constructor(scene, position, direction) {
        this.scene = scene;
        this.position = position;
        this.direction = direction;
        this.model = this.createModel();
        this.life = 2;
    }

    createModel() {
        const geometry = new THREE.SphereGeometry(0.1, 8, 8);
        const material = new THREE.MeshBasicMaterial({color: 0xffff00});
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(this.position);
        return mesh;
    }

    update(delta) {
        this.life -= delta;

        if (this.life <= 0) {
            scene.remove(this.model);
            //scene.remove(this.light);
            saucer.bullets = saucer.bullets.filter(bullet => bullet !== this);
            return;
        }
        this.position.add(this.direction.clone().multiplyScalar(delta * 10));
        this.model.position.copy(this.position);

        // check collision with players
        const skipOthers = this.checkBulletCollision(player);
        if (!skipOthers)
            for (let [key, p] of players) {
                const skip = this.checkBulletCollision(p);
                if (skip)
                    break;
            }
    }

    checkBulletCollision(p) {
        if (p === null || p === player) {
            p = player;
        }
        if (p.playerMesh === undefined) return false;
        if (p.playerMesh.geometry.boundingSphere === null || !p.ready) return false;
        const playerRadius = p.playerMesh.geometry.boundingSphere.radius || 0;
        const bulletRadius = 0.5;

        if (p.playerMesh.position.distanceTo(this.position) < bulletRadius + playerRadius) {
            if (!p.isInvulnerable && p.ready) {
                scene.remove(this.model);
                //scene.remove(this.light);
                saucer.bullets = saucer.bullets.filter(bullet => bullet !== this);
                p.lives--;
                updateLivesDisplay();
                try {
                    const gamepad = navigator.getGamepads()[p.gamepadIndex];
                    gamepad.vibrationActuator.playEffect("dual-rumble", {
                        startDelay: 0, duration: 200, weakMagnitude: 1.0, strongMagnitude: 1.0,
                    });
                } catch (e) {
                    /* probable error */
                }
                if (p.lives <= 0) {
                    playSound(explosionSound);
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
}