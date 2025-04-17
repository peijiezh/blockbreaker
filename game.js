// Block Breaker Game
// Main game logic

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;

// Game state
let gameState = 'start'; // start, playing, paused, levelComplete, gameOver
let score = 0;
let lives = 3;
let level = 1;
let maxLevel = 10;
let animationId;
let lastTime = 0;
let isMobile = false;

// Game elements
let paddle;
let ball;
let balls = []; // For multi-ball power-up
let blocks = [];
let powerUps = [];
let activePowerUps = {};
let powerUpTimers = {};

// Sound effects
const sounds = {};

// Colors (Apple-inspired)
const COLORS = {
    background: '#000000',
    paddle: '#0071e3',
    ball: '#ffffff',
    blockColors: [
        '#ff3b30', // red
        '#ff9500', // orange
        '#ffcc00', // yellow
        '#34c759', // green
        '#5ac8fa', // light blue
        '#007aff', // blue
        '#af52de'  // purple
    ],
    powerUpColors: {
        expand: '#0071e3',
        multiball: '#ff3b30',
        slow: '#af52de',
        extraLife: '#34c759'
    },
    text: '#ffffff'
};

// Game dimensions and settings
const PADDLE_WIDTH = 100;
const PADDLE_HEIGHT = 20;
const PADDLE_SPEED = 6;
const BALL_RADIUS = 10;
const BALL_SPEED = 4;
const BLOCK_WIDTH = 70;
const BLOCK_HEIGHT = 30;
const BLOCK_PADDING = 10;
const POWERUP_SIZE = 20;
const POWERUP_SPEED = 2;
const POWERUP_CHANCE = 0.2; // 20% chance for a block to drop a power-up
const POWERUP_DURATION = 10000; // 10 seconds

// Paddle class
class Paddle {
    constructor(x, y, width, height, color) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.speed = PADDLE_SPEED;
        this.dx = 0;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // Add a slight 3D effect
        ctx.fillStyle = '#ffffff33';
        ctx.fillRect(this.x, this.y, this.width, 5);
    }

    update() {
        this.x += this.dx;
        
        // Keep paddle within canvas bounds
        if (this.x < 0) {
            this.x = 0;
        } else if (this.x + this.width > GAME_WIDTH) {
            this.x = GAME_WIDTH - this.width;
        }
    }

    // Power-up: expand paddle
    expand() {
        this.width = PADDLE_WIDTH * 1.5;
        
        // Make sure paddle doesn't go out of bounds after expanding
        if (this.x + this.width > GAME_WIDTH) {
            this.x = GAME_WIDTH - this.width;
        }
    }

    // Reset paddle to normal size
    resetSize() {
        this.width = PADDLE_WIDTH;
    }
}

// Ball class
class Ball {
    constructor(x, y, radius, speed, color) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.speed = speed;
        this.color = color;
        this.dx = 0; // Will be set when ball is launched
        this.dy = 0; // Will be set when ball is launched
        this.launched = false;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
        
        // Add a slight shine effect
        ctx.beginPath();
        ctx.arc(this.x - this.radius/3, this.y - this.radius/3, this.radius/4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.closePath();
    }

    update() {
        if (!this.launched) {
            // Ball follows paddle before launch
            this.x = paddle.x + paddle.width / 2;
            this.y = paddle.y - this.radius;
            return;
        }

        this.x += this.dx;
        this.y += this.dy;

        // Wall collision detection
        // Left and right walls
        if (this.x - this.radius < 0 || this.x + this.radius > GAME_WIDTH) {
            this.dx = -this.dx;
            playSound('wall');
        }

        // Top wall
        if (this.y - this.radius < 0) {
            this.dy = -this.dy;
            playSound('wall');
        }

        // Bottom wall - ball is lost
        if (this.y + this.radius > GAME_HEIGHT) {
            // If this is the main ball or the last ball in multi-ball mode
            if (balls.length <= 1) {
                lives--;
                playSound('life-lost');
                
                if (lives <= 0) {
                    gameState = 'gameOver';
                    document.getElementById('final-score').textContent = score;
                    document.getElementById('game-over').classList.remove('hidden');
                } else {
                    resetBall();
                }
            } else {
                // Remove this ball from the balls array
                return true;
            }
        }

        // Paddle collision
        if (this.y + this.radius > paddle.y && 
            this.y - this.radius < paddle.y + paddle.height &&
            this.x > paddle.x && 
            this.x < paddle.x + paddle.width) {
            
            // Calculate where the ball hit the paddle (0 to 1)
            const hitPosition = (this.x - paddle.x) / paddle.width;
            
            // Angle based on hit position (-60 to 60 degrees)
            const angle = (hitPosition - 0.5) * Math.PI * 2/3;
            
            // Set new direction based on angle
            this.dx = this.speed * Math.sin(angle);
            this.dy = -this.speed * Math.cos(angle);
            
            playSound('paddle');
        }

        // Block collision
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            
            if (this.y - this.radius < block.y + block.height && 
                this.y + this.radius > block.y && 
                this.x + this.radius > block.x && 
                this.x - this.radius < block.x + block.width) {
                
                // Determine which side of the block was hit
                const overlapLeft = this.x + this.radius - block.x;
                const overlapRight = block.x + block.width - (this.x - this.radius);
                const overlapTop = this.y + this.radius - block.y;
                const overlapBottom = block.y + block.height - (this.y - this.radius);
                
                // Find the smallest overlap
                const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
                
                // Adjust ball direction based on collision side
                if (minOverlap === overlapLeft || minOverlap === overlapRight) {
                    this.dx = -this.dx;
                } else {
                    this.dy = -this.dy;
                }
                
                // Remove the block
                blocks.splice(i, 1);
                i--;
                
                // Increase score
                score += 10;
                updateScore();
                
                // Play sound
                playSound('block');
                
                // Chance to spawn a power-up
                if (Math.random() < POWERUP_CHANCE) {
                    spawnPowerUp(block.x + block.width/2, block.y + block.height/2);
                }
                
                // Check if level is complete
                if (blocks.length === 0) {
                    gameState = 'levelComplete';
                    document.getElementById('level-score').textContent = score;
                    document.getElementById('level-complete').classList.remove('hidden');
                }
            }
        }
        
        return false; // Ball is still in play
    }

    launch() {
        if (!this.launched) {
            this.launched = true;
            // Launch at a random angle between -45 and 45 degrees
            const angle = (Math.random() * 90 - 45) * Math.PI / 180;
            this.dx = this.speed * Math.sin(angle);
            this.dy = -this.speed * Math.cos(angle);
            playSound('launch');
        }
    }

    // Power-up: slow ball
    slow() {
        this.speed = BALL_SPEED * 0.6;
        this.dx = this.dx * 0.6;
        this.dy = this.dy * 0.6;
    }

    // Reset ball speed
    resetSpeed() {
        const currentSpeed = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
        if (currentSpeed === 0) return; // Avoid division by zero
        
        const factor = BALL_SPEED / currentSpeed;
        this.dx *= factor;
        this.dy *= factor;
        this.speed = BALL_SPEED;
    }
}

// Block class
class Block {
    constructor(x, y, width, height, color) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // Add a slight 3D effect
        ctx.fillStyle = '#ffffff33';
        ctx.fillRect(this.x, this.y, this.width, 5);
        
        // Add a border
        ctx.strokeStyle = '#00000033';
        ctx.strokeRect(this.x, this.y, this.width, this.height);
    }
}

// Power-up class
class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.size = POWERUP_SIZE;
        this.type = type;
        this.color = COLORS.powerUpColors[type];
        this.speed = POWERUP_SPEED;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size/2, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
        
        // Add an icon or letter based on power-up type
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        let icon = '';
        switch(this.type) {
            case 'expand': icon = 'E'; break;
            case 'multiball': icon = 'M'; break;
            case 'slow': icon = 'S'; break;
            case 'extraLife': icon = '+'; break;
        }
        
        ctx.fillText(icon, this.x, this.y);
    }

    update() {
        this.y += this.speed;
        
        // Check if power-up is caught by paddle
        if (this.y + this.size/2 > paddle.y && 
            this.y - this.size/2 < paddle.y + paddle.height &&
            this.x + this.size/2 > paddle.x && 
            this.x - this.size/2 < paddle.x + paddle.width) {
            
            // Apply power-up effect
            applyPowerUp(this.type);
            playSound('powerup');
            
            // Remove power-up
            return true;
        }
        
        // Remove if power-up goes off screen
        if (this.y - this.size/2 > GAME_HEIGHT) {
            return true;
        }
        
        return false;
    }
}

// Initialize game elements
function initGame() {
    // Create paddle
    paddle = new Paddle(
        (GAME_WIDTH - PADDLE_WIDTH) / 2,
        GAME_HEIGHT - PADDLE_HEIGHT - 10,
        PADDLE_WIDTH,
        PADDLE_HEIGHT,
        COLORS.paddle
    );
    
    // Create ball
    ball = new Ball(
        GAME_WIDTH / 2,
        GAME_HEIGHT - PADDLE_HEIGHT - 20 - BALL_RADIUS,
        BALL_RADIUS,
        BALL_SPEED,
        COLORS.ball
    );
    
    balls = [ball]; // Initialize balls array with main ball
    
    // Create blocks for current level
    createBlocks();
    
    // Reset power-ups
    powerUps = [];
    activePowerUps = {};
    powerUpTimers = {};
    
    // Update UI
    updateScore();
    updateLives();
    updateLevel();
    
    // Check if device is mobile
    checkDeviceType();
}

// Create blocks based on current level
function createBlocks() {
    blocks = [];
    
    // Different block layouts based on level
    const rows = Math.min(3 + Math.floor(level / 2), 8);
    const cols = Math.min(7 + Math.floor(level / 3), 11);
    
    const totalWidth = cols * (BLOCK_WIDTH + BLOCK_PADDING) - BLOCK_PADDING;
    const startX = (GAME_WIDTH - totalWidth) / 2;
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            // Skip some blocks for interesting patterns in higher levels
            if (level > 3 && Math.random() < 0.1) continue;
            
            const blockX = startX + c * (BLOCK_WIDTH + BLOCK_PADDING);
            const blockY = 50 + r * (BLOCK_HEIGHT + BLOCK_PADDING);
            
            // Color based on row
            const colorIndex = r % COLORS.blockColors.length;
            
            blocks.push(new Block(
                blockX,
                blockY,
                BLOCK_WIDTH,
                BLOCK_HEIGHT,
                COLORS.blockColors[colorIndex]
            ));
        }
    }
}

// Reset ball to initial position
function resetBall() {
    ball = new Ball(
        GAME_WIDTH / 2,
        GAME_HEIGHT - PADDLE_HEIGHT - 20 - BALL_RADIUS,
        BALL_RADIUS,
        BALL_SPEED,
        COLORS.ball
    );
    
    balls = [ball];
    
    // Reset power-ups
    clearPowerUps();
    
    // Update UI
    updateLives();
}

// Spawn a power-up
function spawnPowerUp(x, y) {
    const types = ['expand', 'multiball', 'slow', 'extraLife'];
    const randomType = types[Math.floor(Math.random() * types.length)];
    
    powerUps.push(new PowerUp(x, y, randomType));
}

// Apply power-up effect
function applyPowerUp(type) {
    // If power-up is already active, clear its timer
    if (activePowerUps[type]) {
        clearTimeout(powerUpTimers[type]);
    }
    
    // Apply effect based on type
    switch(type) {
        case 'expand':
            paddle.expand();
            break;
        case 'multiball':
            // Create two additional balls
            for (let i = 0; i < 2; i++) {
                const newBall = new Ball(
                    ball.x,
                    ball.y,
                    BALL_RADIUS,
                    BALL_SPEED,
                    COLORS.ball
                );
                
                // Launch in random directions
                const angle = (Math.random() * 360) * Math.PI / 180;
                newBall.dx = newBall.speed * Math.sin(angle);
                newBall.dy = newBall.speed * Math.cos(angle);
                newBall.launched = true;
                
                balls.push(newBall);
            }
            break;
        case 'slow':
            // Slow down all balls
            balls.forEach(ball => ball.slow());
            break;
        case 'extraLife':
            lives++;
            updateLives();
            return; // No need for timeout for extra life
    }
    
    // Mark power-up as active
    activePowerUps[type] = true;
    
    // Set timer to remove power-up effect
    powerUpTimers[type] = setTimeout(() => {
        removePowerUp(type);
    }, POWERUP_DURATION);
}

// Remove power-up effect
function removePowerUp(type) {
    switch(type) {
        case 'expand':
            paddle.resetSize();
            break;
        case 'slow':
            balls.forEach(ball => ball.resetSpeed());
            break;
        // multiball doesn't need to be removed, balls will disappear when they fall off
    }
    
    // Mark power-up as inactive
    activePowerUps[type] = false;
}

// Clear all active power-ups
function clearPowerUps() {
    for (const type in activePowerUps) {
        if (activePowerUps[type]) {
            clearTimeout(powerUpTimers[type]);
            removePowerUp(type);
        }
    }
    
    activePowerUps = {};
    powerUpTimers = {};
}

// Update score display
function updateScore() {
    document.getElementById('score-display').textContent = score;
}

// Update lives display
function updateLives() {
    document.getElementById('lives-display').textContent = lives;
}

// Update level display
function updateLevel() {
    document.getElementById('level-display').textContent = level;
}

// Play sound effect
function playSound(soundName) {
    // If sound is loaded, play it
    if (sounds[soundName]) {
        const sound = sounds[soundName].cloneNode();
        sound.volume = 0.3;
        sound.play();
    }
}

// Load sound effects
function loadSounds() {
    const soundFiles = {
        'paddle': 'sounds/paddle.mp3',
        'wall': 'sounds/wall.mp3',
        'block': 'sounds/block.mp3',
        'life-lost': 'sounds/life-lost.mp3',
        'powerup': 'sounds/powerup.mp3',
        'launch': 'sounds/launch.mp3',
        'level-complete': 'sounds/level-complete.mp3'
    };
    
    // Create audio elements for each sound
    for (const sound in soundFiles) {
        try {
            const audio = new Audio(soundFiles[sound]);
            sounds[sound] = audio;
        } catch (e) {
            console.log(`Failed to load sound: ${sound}`);
        }
    }
}

// Check if device is mobile
function checkDeviceType() {
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Show mobile controls if on mobile device
    if (isMobile) {
        document.getElementById('mobile-controls').classList.remove('hidden');
    }
}

// Game loop
function gameLoop(timestamp) {
    // Calculate delta time
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    
    // Clear canvas
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    
    if (gameState === 'playing') {
        // Update paddle
        paddle.update();
        
        // Update balls
        for (let i = 0; i < balls.length; i++) {
            const shouldRemove = balls[i].update();
            
            if (shouldRemove) {
                balls.splice(i, 1);
                i--;
            }
        }
        
        // Update power-ups
        for (let i = 0; i < powerUps.length; i++) {
            const shouldRemove = powerUps[i].update();
            
            if (shouldRemove) {
                powerUps.splice(i, 1);
                i--;
            }
        }
    }
    
    // Draw game elements
    paddle.draw();
    
    balls.forEach(ball => ball.draw());
    blocks.forEach(block => block.draw());
    powerUps.forEach(powerUp => powerUp.draw());
    
    // Request next frame
    animationId = requestAnimationFrame(gameLoop);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize game
    initGame();
    
    // Load sounds
    loadSounds();
    
    // Start button
    document.getElementById('start-button').addEventListener('click', () => {
        gameState = 'playing';
        document.getElementById('start-screen').classList.add('hidden');
        animationId = requestAnimationFrame(gameLoop);
    });
    
    // Next level button
    document.getElementById('next-level-button').addEventListener('click', () => {
        level++;
        if (level > maxLevel) {
            level = 1;
        }
        
        document.getElementById('level-complete').classList.add('hidden');
        initGame();
        gameState = 'playing';
    });
    
    // Restart button
    document.getElementById('restart-button').addEventListener('click', () => {
        score = 0;
        lives = 3;
        level = 1;
        
        document.getElementById('game-over').classList.add('hidden');
        initGame();
        gameState = 'playing';
    });
    
    // Resume button
    document.getElementById('resume-button').addEventListener('click', () => {
        gameState = 'playing';
        document.getElementById('pause-screen').classList.add('hidden');
    });
    
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        if (gameState !== 'playing') return;
        
        if (e.key === 'ArrowLeft' || e.key === 'a') {
            paddle.dx = -paddle.speed;
        } else if (e.key === 'ArrowRight' || e.key === 'd') {
            paddle.dx = paddle.speed;
        } else if (e.key === ' ') {
            balls.forEach(ball => ball.launch());
        } else if (e.key === 'p' || e.key === 'P') {
            gameState = 'paused';
            document.getElementById('pause-screen').classList.remove('hidden');
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'ArrowRight' || e.key === 'd') {
            paddle.dx = 0;
        }
    });
    
    // Mouse controls
    canvas.addEventListener('mousemove', (e) => {
        if (gameState !== 'playing' || isMobile) return;
        
        const relativeX = e.clientX - canvas.getBoundingClientRect().left;
        paddle.x = relativeX - paddle.width / 2;
        
        // Keep paddle within canvas bounds
        if (paddle.x < 0) {
            paddle.x = 0;
        } else if (paddle.x + paddle.width > GAME_WIDTH) {
            paddle.x = GAME_WIDTH - paddle.width;
        }
    });
    
    canvas.addEventListener('click', () => {
        if (gameState === 'playing') {
            balls.forEach(ball => ball.launch());
        }
    });
    
    // Touch controls for mobile
    let touchStartX = 0;
    
    document.getElementById('left-control').addEventListener('touchstart', (e) => {
        if (gameState !== 'playing') return;
        paddle.dx = -paddle.speed;
    });
    
    document.getElementById('right-control').addEventListener('touchstart', (e) => {
        if (gameState !== 'playing') return;
        paddle.dx = paddle.speed;
    });
    
    document.getElementById('left-control').addEventListener('touchend', () => {
        paddle.dx = 0;
    });
    
    document.getElementById('right-control').addEventListener('touchend', () => {
        paddle.dx = 0;
    });
    
    canvas.addEventListener('touchstart', (e) => {
        if (gameState !== 'playing') return;
        
        touchStartX = e.touches[0].clientX;
        
        // Launch ball on tap
        balls.forEach(ball => ball.launch());
    });
    
    canvas.addEventListener('touchmove', (e) => {
        if (gameState !== 'playing' || !isMobile) return;
        e.preventDefault();
        
        const touchX = e.touches[0].clientX;
        const deltaX = touchX - touchStartX;
        
        paddle.x += deltaX * 0.5; // Adjust sensitivity
        
        // Keep paddle within canvas bounds
        if (paddle.x < 0) {
            paddle.x = 0;
        } else if (paddle.x + paddle.width > GAME_WIDTH) {
            paddle.x = GAME_WIDTH - paddle.width;
        }
        
        touchStartX = touchX;
    });
    
    // Handle window resize
    window.addEventListener('resize', () => {
        checkDeviceType();
    });
    
    // Start the game loop
    lastTime = performance.now();
    gameLoop(lastTime);
});
