class InvulnerablePhase {
    constructor(parent, delay = 3000) {
        this.parent = parent;
        this.timerId = setTimeout(() => endInvulnerability(this.parent), delay);
    }

    cancel() {
        clearTimeout(this.timerId);
    }

    reset(delay = 3000) {
        clearTimeout(this.timerId);
        this.timerId = setTimeout(() => endInvulnerability(this.parent), delay);
    }
}

function endInvulnerability(object) {
    object.isInvulnerable = false;
    object.invulnerableTimePassed = 0;
    object.playerMesh.visible = true;
    object.playerMesh.material.color.set(object.mainColor);
}