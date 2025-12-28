import * as THREE from 'three';
import { formatTime } from '../utils/math.js';

export class Match {
    constructor(game) {
        this.game = game;
        this.state = 'waiting'; // waiting, playing, ended
        this.startTime = 0;
        this.elapsedTime = 0;
        this.winner = null;
        
        // Stats
        this.kills = 0;
        this.totalBots = 0;
    }
    
    start(botCount) {
        this.state = 'playing';
        this.startTime = performance.now();
        this.totalBots = botCount;
        this.kills = 0;
    }
    
    update(deltaTime, currentTime) {
        if (this.state !== 'playing') return;
        
        this.elapsedTime = (currentTime - this.startTime) / 1000;
        
        // Check win/lose conditions
        this.checkEndConditions();
    }
    
    checkEndConditions() {
        const { player, botManager } = this.game;
        
        // Player died
        if (!player.alive) {
            this.endMatch('defeat');
            return;
        }
        
        // All bots eliminated
        if (botManager.getAliveCount() === 0) {
            this.endMatch('victory');
            return;
        }
    }
    
    endMatch(result) {
        this.state = 'ended';
        this.winner = result;
        this.game.onMatchEnd(result);
    }
    
    addKill() {
        this.kills++;
        this.game.player.kills++;
    }
    
    getStats() {
        return {
            kills: this.kills,
            time: formatTime(this.elapsedTime),
            botsRemaining: this.game.botManager.getAliveCount(),
            totalBots: this.totalBots
        };
    }
    
    getAliveCount() {
        return 1 + this.game.botManager.getAliveCount(); // Player + bots
    }
    
    isPlaying() {
        return this.state === 'playing';
    }
    
    reset() {
        this.state = 'waiting';
        this.startTime = 0;
        this.elapsedTime = 0;
        this.kills = 0;
        this.winner = null;
    }
}
