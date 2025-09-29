// electron-main.js

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

// Set up database path in user data directory
const userDataPath = process.env.APPDATA || 
    (process.platform === 'darwin' ? 
        process.env.HOME + '/Library/Application Support' : 
        process.env.HOME + "/.config");
const dataDir = path.join(userDataPath, 'my-kanban-app');
const dbPath = path.join(dataDir, 'kanban.db');

// Ensure directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize better-sqlite3 database and tables
function initDatabase() {
    const db = new Database(dbPath);

    // Create tables (better-sqlite3 uses synchronous exec)
    db.exec(`
        CREATE TABLE IF NOT EXISTS boards (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            icon TEXT DEFAULT 'board',
            pinned INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS lists (
            id TEXT PRIMARY KEY,
            board_id TEXT NOT NULL,
            title TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS cards (
            id TEXT PRIMARY KEY,
            list_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            pinned INTEGER DEFAULT 0,
            FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
        );
    `);

    return db;
}

// Initialize DB when app starts
let db = initDatabase();

function createWindow() {
    const win = new BrowserWindow({
        fullscreen: true,
        frame: false,
        show: false, // Don't show the window immediately
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    win.setMenu(null);
    win.loadFile('base.html');
    
    // Show the window when it's ready to prevent flash
    win.once('ready-to-show', () => {
        win.show();
        win.focus();
    });
    
    // Remove this line to disable auto-opening dev tools:
    // win.webContents.openDevTools();
}

// SAVE BOARDS TO BETTER-SQLITE3
ipcMain.handle('sqlite-save-boards', async (event, boards) => {
    try {
        console.log('📝 SAVING BOARDS TO DATABASE:', Object.keys(boards).length, 'boards');
        console.log('📝 Boards data:', JSON.stringify(boards, null, 2));

        // Begin transaction
        const transaction = db.transaction(() => {
            // Clear all tables
            const deletedCards = db.prepare("DELETE FROM cards").run();
            const deletedLists = db.prepare("DELETE FROM lists").run();
            const deletedBoards = db.prepare("DELETE FROM boards").run();
            
            console.log('🗑️ Cleared tables - Cards:', deletedCards.changes, 'Lists:', deletedLists.changes, 'Boards:', deletedBoards.changes);

            // Prepare statements for better performance
            const insertBoard = db.prepare(`INSERT INTO boards (id, name, icon, pinned) VALUES (?, ?, ?, ?)`);
            const insertList = db.prepare(`INSERT INTO lists (id, board_id, title, position) VALUES (?, ?, ?, ?)`);
            const insertCard = db.prepare(`INSERT INTO cards (id, list_id, title, description, created_at, position, pinned) VALUES (?, ?, ?, ?, ?, ?, ?)`);

            let boardCount = 0, listCount = 0, cardCount = 0;

            // Insert boards
            for (const boardId in boards) {
                const board = boards[boardId];
                console.log('➕ Inserting board:', board.name, '(ID:', board.id, ')');
                insertBoard.run(board.id, board.name, board.icon || 'board', board.pinned ? 1 : 0);
                boardCount++;

                // Insert lists
                for (const list of board.lists || []) {
                    console.log('  ➕ Inserting list:', list.title, '(ID:', list.id, ')');
                    insertList.run(list.id, board.id, list.title, list.position || 0);
                    listCount++;

                    // Insert cards
                    for (const card of list.cards || []) {
                        console.log('    ➕ Inserting card:', card.title, '(ID:', card.id, ')');
                        insertCard.run(
                            card.id,
                            list.id,
                            card.title,
                            card.description || null,
                            card.createdAt || new Date().toISOString(),
                            card.position || 0,
                            card.pinned ? 1 : 0
                        );
                        cardCount++;
                    }
                }
            }

            console.log(`✅ INSERTED: ${boardCount} boards, ${listCount} lists, ${cardCount} cards`);
        });

        // Execute transaction
        transaction();
        console.log('💾 TRANSACTION COMMITTED SUCCESSFULLY');
        return true;
    } catch (error) {
        console.error('❌ Error saving boards:', error);
        throw error;
    }
});

// LOAD BOARDS FROM BETTER-SQLITE3
ipcMain.handle('sqlite-load-boards', async () => {
    try {
        console.log('📖 LOADING BOARDS FROM DATABASE...');
        const boards = {};

        // Load boards
        const boardRows = db.prepare("SELECT * FROM boards ORDER BY pinned DESC, name ASC").all();
        console.log('📋 Found', boardRows.length, 'boards in database');
        
        if (boardRows.length === 0) {
            console.log('⚠️ No boards found in database');
            return boards;
        }

        // Load lists and cards for each board
        for (const boardRow of boardRows) {
            console.log('📋 Loading board:', boardRow.name, '(ID:', boardRow.id, ')');
            boards[boardRow.id] = {
                id: boardRow.id,
                name: boardRow.name,
                icon: boardRow.icon,
                pinned: Boolean(boardRow.pinned),
                lists: []
            };

            // Load lists
            const listRows = db.prepare("SELECT * FROM lists WHERE board_id = ? ORDER BY position ASC").all(boardRow.id);
            console.log('  📄 Found', listRows.length, 'lists for board', boardRow.name);
            
            for (const listRow of listRows) {
                console.log('  📄 Loading list:', listRow.title, '(ID:', listRow.id, ')');
                const list = {
                    id: listRow.id,
                    title: listRow.title,
                    position: listRow.position,
                    cards: []
                };

                // Load cards
                const cardRows = db.prepare("SELECT * FROM cards WHERE list_id = ? ORDER BY pinned DESC, position ASC").all(listRow.id);
                console.log('    🃏 Found', cardRows.length, 'cards for list', listRow.title);
                
                list.cards = cardRows.map(cardRow => {
                    console.log('    🃏 Loading card:', cardRow.title, '(ID:', cardRow.id, ')');
                    return {
                        id: cardRow.id,
                        title: cardRow.title,
                        description: cardRow.description,
                        createdAt: cardRow.created_at,
                        position: cardRow.position,
                        pinned: Boolean(cardRow.pinned)
                    };
                });

                boards[boardRow.id].lists.push(list);
            }
        }

        console.log('✅ LOADED', Object.keys(boards).length, 'boards successfully');
        console.log('📖 Loaded boards data:', JSON.stringify(boards, null, 2));
        return boards;
    } catch (error) {
        console.error('❌ Error loading boards:', error);
        throw error;
    }
});

// Keep for backward compatibility (optional)
ipcMain.handle('mkdir-sync', async (event, dir) => {
    fs.mkdirSync(dir, { recursive: true });
    return true;
});

// App lifecycle
app.whenReady().then(() => {
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Close DB when app quits
app.on('before-quit', () => {
    if (db) {
        try {
            db.close();
            console.log("Database closed successfully.");
        } catch (err) {
            console.error("Error closing database:", err);
        }
    }
});