export class Menu {
    constructor(onStart, onRestart) {
        this.menuOverlay = document.getElementById('menu-overlay');
        this.gameoverOverlay = document.getElementById('gameover-overlay');
        this.loadingScreen = document.getElementById('loading-screen');
        this.loadingBar = document.getElementById('loading-bar');
        
        this.startBtn = document.getElementById('start-btn');
        this.restartBtn = document.getElementById('restart-btn');
        
        this.gameoverTitle = document.getElementById('gameover-title');
        this.finalKills = document.getElementById('final-kills');
        this.finalTime = document.getElementById('final-time');
        
        this.onStart = onStart;
        this.onRestart = onRestart;
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.startBtn.addEventListener('click', () => {
            this.hideMenu();
            this.onStart();
        });
        
        this.restartBtn.addEventListener('click', () => {
            this.hideGameover();
            this.onRestart();
        });
    }
    
    showLoading() {
        this.loadingScreen.classList.remove('hidden');
    }
    
    hideLoading() {
        this.loadingScreen.classList.add('hidden');
    }
    
    updateLoadingProgress(progress) {
        this.loadingBar.style.width = `${progress * 100}%`;
    }
    
    showMenu() {
        this.menuOverlay.classList.remove('hidden');
    }
    
    hideMenu() {
        this.menuOverlay.classList.add('hidden');
    }
    
    showGameover(result, stats) {
        this.gameoverTitle.textContent = result === 'victory' ? 'Victory Royale!' : 'Game Over';
        this.gameoverTitle.className = result;
        
        this.finalKills.textContent = stats.kills;
        this.finalTime.textContent = stats.time;
        
        this.gameoverOverlay.classList.add('show');
    }
    
    hideGameover() {
        this.gameoverOverlay.classList.remove('show');
    }
    
    isMenuVisible() {
        return !this.menuOverlay.classList.contains('hidden');
    }
    
    isGameoverVisible() {
        return this.gameoverOverlay.classList.contains('show');
    }
}
