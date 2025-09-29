// main.js

// ======================
// TEMPLATE LOADING
// ======================
let boardTemplate = '';
let listTemplate = '';
let cardTemplate = '';
async function loadTemplates() {
    try {
        boardTemplate = await fetch('board.html').then(r => r.text());
        listTemplate = await fetch('lists.html').then(r => r.text());
        cardTemplate = await fetch('cards.html').then(r => r.text());
    } catch (err) {
        console.error("Failed to load templates:", err);
    }
}

function renderTemplate(template, replacements) {
    let html = template;
    for (const [key, value] of Object.entries(replacements)) {
        html = html.replace(`[[${key}]]`, value);
    }
    return html;
}

// function createElementFromHTML(htmlString) {
//     const div = document.createElement('div');
//     div.innerHTML = htmlString.trim();
//     return div.firstElementChild;
// }

// ======================
// APP STATE — NOW LOADED FROM SQLITE
// ======================
let currentBoardId = 'default';
let boards = {};

async function loadBoards() {
    try {
        const loadedBoards = await window.electronAPI.loadBoards();
        if (loadedBoards && Object.keys(loadedBoards).length > 0) {
            boards = loadedBoards;
        } else {
            boards = getDefaultBoards();
        }

        // ✅ Load saved zoom level for current board (if exists)
        const savedZoom = localStorage.getItem(`zoom-${currentBoardId}`);
        if (savedZoom) {
            currentScale = parseFloat(savedZoom);
        } else {
            currentScale = 1; // default if never zoomed
        }

        // ✅ Apply saved zoom level using CSS variable
        document.documentElement.style.setProperty('--ui-scale', currentScale);

        // ✅ Apply immediately to container
        // const zoomContainer = document.getElementById('zoom-container');
        // if (zoomContainer) {
        //     zoomContainer.style.transform = `scale(${currentScale})`;
        // }

    } catch (e) {
        console.error("Failed to load boards from SQLite:", e);
        boards = getDefaultBoards();
        currentScale = 1;
        // const zoomContainer = document.getElementById('zoom-container');
        // if (zoomContainer) {
        //     zoomContainer.style.transform = 'scale(1)';
        // }
    }
}

// ✅ SAVE BOARDS TO SQLITE (pass JS object directly)
// Add this debugging version to your main.js - replace your existing saveBoards and loadBoards functions

async function saveBoards() {
    try {
        console.log('🔄 Frontend calling saveBoards with data:', boards);
        console.log('🔄 Number of boards to save:', Object.keys(boards).length);
        const result = await window.electronAPI.saveBoards(boards);
        console.log('✅ Frontend saveBoards result:', result);
    } catch (e) {
        console.error("❌ Frontend failed to save boards:", e);
    }
}


async function loadBoards() {
    try {
        console.log('🔄 Frontend calling loadBoards...');
        const loadedBoards = await window.electronAPI.loadBoards();
        console.log('📥 Frontend received boards:', loadedBoards);
        console.log('📥 Number of boards loaded:', Object.keys(loadedBoards || {}).length);
        
        if (loadedBoards && Object.keys(loadedBoards).length > 0) {
            boards = loadedBoards;
            console.log('✅ Using loaded boards from database');
        } else {
            boards = getDefaultBoards();
            console.log('⚠️ No boards loaded, using default boards');
        }

        // Rest of your existing loadBoards code...
        const savedZoom = localStorage.getItem(`zoom-${currentBoardId}`);
        if (savedZoom) {
            currentScale = parseFloat(savedZoom);
        } else {
            currentScale = 1;
        }

        document.documentElement.style.setProperty('--ui-scale', currentScale);

    } catch (e) {
        console.error("❌ Frontend failed to load boards:", e);
        boards = getDefaultBoards();
        currentScale = 1;
    }
}

function getDefaultBoards() {
    return {
        default: {
            id: 'default',
            name: 'Personal Tasks',
            icon: 'board',
            lists: [
                { id: 'todo-default', title: 'To Do', cards: [] },
                { id: 'in-progress-default', title: 'In Progress', cards: [] },
                { id: 'completed-default', title: 'Completed', cards: [] }
            ]
        }
    };
}

// ======================
// GLOBAL VARIABLES
// ======================
let draggedCard = null;
let dragStartListId = null;
let dragStartIndex = -1;
let listToDelete = null;
let boardToDelete = null;
let cardToEdit = null;
let currentHighlight = null;
let isDragging = false;
let currentScale = 1;
let zoomHistory = {};

// DOM Elements — WILL BE ASSIGNED AFTER DOM IS READY
let sidebarContainer, sidebarToggle, themeToggle, themeLabel, addListBtn, addBoardBtn, settingsBtn;
let addListModal, addBoardModal, deleteListModal, deleteBoardModal, editCardModal;
let listNameInput, boardNameInput, editCardTitle, editCardDescription;
let createListBtn, createBoardBtn, confirmDeleteListBtn, confirmDeleteBoardBtn, saveEditCard;
let boardTitle, kanbanBoard, boardsList;
let closeAddListModal, closeAddBoardModal, closeEditCardModal;
let cancelAddList, cancelAddBoard, cancelDeleteList, cancelDeleteBoard, cancelEditCard;

// ======================
// HELPER FUNCTIONS
// ======================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);
    if (diffInHours < 1) {
        const diffInMinutes = Math.floor(diffInHours * 60);
        return `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
        return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInHours < 48) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
}

// ======================
// RENDERING FUNCTIONS
// ======================
function renderBoard() {
    const appContainer = document.getElementById('app');
    if (!appContainer) {
        console.error("Missing #app container");
        return;
    }

    fetch('board.html')
        .then(r => r.text())
        .then(boardHtml => {
            appContainer.innerHTML = boardHtml;
            // ✅ Ensure zoom container exists
            // const zoomContainer = document.getElementById('zoom-container');
            // if (!zoomContainer) {
            //     console.error("❌ #zoom-container not found in board.html!");
            //     appContainer.innerHTML = '<div style="color: red; padding: 40px; text-align: center;">Missing zoom container. Check base.html.</div>';
            //     return;
            // }
            kanbanBoard = document.getElementById('kanbanBoard');
            if (!kanbanBoard) {
                console.error("❌ #kanbanBoard not found in board.html!");
                appContainer.innerHTML = '<div style="color: red; padding: 40px; text-align: center;">Failed to load board structure. Check board.html.</div>';
                return;
            }

            kanbanBoard.innerHTML = '';

            if (isDragging) {
               console.log("Skipping renderBoard() because drag is in progress");
               return; // ✅ DO NOT RE-RENDER DURING DRAG
            }
            
            if (!boards[currentBoardId]) {
               currentBoardId = Object.keys(boards)[0];
               updateBoardTitle();
            }

            if (!boards[currentBoardId]) {
                kanbanBoard.innerHTML = '<p>No boards available</p>';
                return;
            }

            fetch('lists.html')
                .then(r => r.text())
                .then(listTemplate => {
                    // ✅ Sort lists: pinned first, then by position
                    const sortedLists = [...boards[currentBoardId].lists].sort((a, b) => {
                        if (a.pinned !== b.pinned) return b.pinned - a.pinned; // pinned = 1, unpinned = 0 → pinned first
                        return (a.position || 0) - (b.position || 0);
                    });
                    
                    sortedLists.forEach(list => {
                        const columnHtml = listTemplate
                            .replace(/\[\[LIST_ID\]\]/g, list.id)
                            .replace('[[LIST_TITLE]]', escapeHtml(list.title));
                        const column = createElementFromHTML(columnHtml);
                        kanbanBoard.appendChild(column);
                    
                        const cardList = column.querySelector('.card-list');
                        if (!cardList) return;
                    
                        // ✅ Sort cards: pinned first, then by position
                        const sortedCards = [...list.cards].sort((a, b) => {
                            if (a.pinned !== b.pinned) return b.pinned - a.pinned; // pinned first
                            return (a.position || 0) - (b.position || 0);
                        });
                    
                        fetch('cards.html')
                            .then(r => r.text())
                            .then(cardTemplate => {
                                sortedCards.forEach((card, index) => {
                                    if (!card || !card.id || !card.title) {
                                        console.error("Malformed card object:", card, "in list:", list.id);
                                        return;
                                    }
                                    const cardHtml = cardTemplate
                                        .replace(/\[\[LIST_ID\]\]/g, list.id)
                                        .replace('[[CARD_ID]]', card.id)
                                        .replace('[[INDEX]]', index)
                                        .replace('[[TITLE]]', escapeHtml(card.title))
                                        .replace('[[DESCRIPTION_HTML]]', card.description ? `<div class="card-description">${escapeHtml(card.description)}</div>` : '')
                                        .replace('[[CREATED_AT_FORMATTED]]', formatDate(card.createdAt));
                                    const cardEl = createElementFromHTML(cardHtml);
                                    if (!cardEl) {
                                        console.error("Failed to render card HTML:", cardHtml);
                                        return;
                                    }
                                    cardList.appendChild(cardEl);
                                    attachCardEvents(cardEl);
                                });
                            });
                        attachColumnEvents(column, list.id);
                    });

                    attachBoardTitleEvents();

                    // Remove any existing listeners first
                    kanbanBoard.removeEventListener('dragstart', handleDragStart);
                    kanbanBoard.removeEventListener('dragend', handleDragEnd);
                    kanbanBoard.removeEventListener('dragover', handleDragOver);
                    kanbanBoard.removeEventListener('dragenter', handleDragEnter);
                    kanbanBoard.removeEventListener('dragleave', handleDragLeave);
                    kanbanBoard.removeEventListener('drop', handleDrop);

                    // Re-attach fresh listeners
                    kanbanBoard.addEventListener('dragstart', handleDragStart);
                    kanbanBoard.addEventListener('dragend', handleDragEnd);
                    kanbanBoard.addEventListener('dragover', handleDragOver);
                    kanbanBoard.addEventListener('dragenter', handleDragEnter);
                    kanbanBoard.addEventListener('dragleave', handleDragLeave);
                    kanbanBoard.addEventListener('drop', handleDrop);

                    // ✅ SHOW the + button when rendering the board
                    addListBtn.style.display = 'flex';


                    // ✅ PRESERVE zoom level after re-rendering
                    setTimeout(() => {
                        const kanbanBoard = document.getElementById('kanbanBoard');
                        // if (kanbanBoard && currentScale !== 1) {
                        //     kanbanBoard.style.transform = `scale(${currentScale})`;
                        //     kanbanBoard.style.transformOrigin = 'top left';
                        // }
                    }, 0);
                });
        })
        .catch(err => {
            console.error("❌ Failed to load board.html:", err);
            appContainer.innerHTML = '<div style="color: red; padding: 40px; text-align: center;">Failed to load board template. Check file path.</div>';
        });
}

function attachColumnEvents(column, listId) {
    const columnHeader = column.querySelector('.column-header');
    const columnTitleContainer = column.querySelector('.column-title-container');
    const addCardBtn = column.querySelector('.add-card-btn');
    const deleteListBtn = column.querySelector('.delete-list-btn');

    columnTitleContainer.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        startListRename(listId);
    });

    addCardBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        showAddCardForm(listId);
    });

    deleteListBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        confirmDeleteList(listId);
    });

    const pinListBtn = column.querySelector('.pin-icon');
    if (pinListBtn) {
        pinListBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const list = boards[currentBoardId].lists.find(l => l.id === listId);
            if (list) {
                list.pinned = !list.pinned;
                saveBoards();
                renderBoard(); // Re-render to re-sort
            }
        });
    }
}

function attachCardEvents(cardEl) {
    cardEl.addEventListener('dblclick', function() {
        const listId = cardEl.getAttribute('data-list-id');
        const cardId = cardEl.getAttribute('data-card-id');
        editCard(listId, cardId);
    });
}

// ======================
// EVENT HANDLERS
// ======================
function startBoardRename() {
    const titleElement = document.getElementById('boardTitle');
    if (!titleElement) return;

    const currentName = boards[currentBoardId].name;
    const titleContainer = titleElement.parentElement;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'board-title-input';
    input.value = currentName;

    // Replace title with input
    titleContainer.replaceChild(input, titleElement);
    input.focus();
    input.select();

    let inputRemoved = false; // ✅ Guard flag

    const finishRename = function() {
        if (inputRemoved) return; // ✅ EARLY EXIT — prevents double removal
        inputRemoved = true; // ✅ Set IMMEDIATELY

        const newName = input.value.trim();
        if (newName && newName !== currentName) {
            boards[currentBoardId].name = newName;
            saveBoards();
            renderBoardsList();
        }

        const newTitle = document.createElement('h1');
        newTitle.className = 'board-title';
        newTitle.id = 'boardTitle';
        newTitle.textContent = boards[currentBoardId].name;

        // ✅ Only replace if input still exists in DOM
        if (input.parentNode === titleContainer) {
            titleContainer.replaceChild(newTitle, input);
        } else {
            // This shouldn't happen unless something else removed it — but just in case
            titleContainer.appendChild(newTitle);
        }

        attachBoardTitleEvents();
    };

    // ✅ Blur handler
    input.addEventListener('blur', finishRename);

    // ✅ Keydown handler — now sets inputRemoved = true
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishRename();
        } else if (e.key === 'Escape') {
            e.preventDefault(); // ✅ Prevent default behavior

            // Restore original title
            const newTitle = document.createElement('h1');
            newTitle.className = 'board-title';
            newTitle.id = 'boardTitle';
            newTitle.textContent = currentName;

            if (input.parentNode === titleContainer) {
                titleContainer.replaceChild(newTitle, input);
            }

            // ✅ CRITICAL: Mark as removed — this prevents blur from crashing later
            inputRemoved = true;

            attachBoardTitleEvents(); // ✅ Reattach events for new title
        }
    });
}

function attachBoardTitleEvents() {
    const titleElement = document.getElementById('boardTitle');
    if (titleElement) {
        const newTitle = titleElement.cloneNode(true);
        titleElement.parentNode.replaceChild(newTitle, titleElement);
        newTitle.addEventListener('dblclick', function() {
            startBoardRename();
        });
    }
}

function updateBoardTitle() {
    const titleElement = document.getElementById('boardTitle');
    if (titleElement && boards[currentBoardId]) {
        titleElement.textContent = boards[currentBoardId].name;
        attachBoardTitleEvents();
    }
}

function getIconSVG(iconType) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.className = "board-icon";

    switch(iconType) {
        case 'briefcase':
            const polyline1 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
            polyline1.setAttribute("points", "22 12 16 12 14 15 10 15 8 12 2 12");
            const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path1.setAttribute("d", "M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z");
            svg.appendChild(polyline1);
            svg.appendChild(path1);
            break;
        case 'home':
            const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path2.setAttribute("d", "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z");
            const polyline2 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
            polyline2.setAttribute("points", "9 22 9 12 15 12 15 22");
            svg.appendChild(path2);
            svg.appendChild(polyline2);
            break;
        case 'project':
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", "12");
            circle.setAttribute("cy", "12");
            circle.setAttribute("r", "10");
            const polyline3 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
            polyline3.setAttribute("points", "8 14 12 10 16 14");
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", "12");
            line.setAttribute("y1", "10");
            line.setAttribute("x2", "12");
            line.setAttribute("y2", "20");
            svg.appendChild(circle);
            svg.appendChild(polyline3);
            svg.appendChild(line);
            break;
        default:
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", "3");
            rect.setAttribute("y", "3");
            rect.setAttribute("width", "18");
            rect.setAttribute("height", "18");
            rect.setAttribute("rx", "2");
            rect.setAttribute("ry", "2");
            const line1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line1.setAttribute("x1", "3");
            line1.setAttribute("y1", "9");
            line1.setAttribute("x2", "21");
            line1.setAttribute("y2", "9");
            const line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line2.setAttribute('x1', "9");
            line2.setAttribute('y1', "21");
            line2.setAttribute('x2', "9");
            line2.setAttribute('y2', "9");
            svg.appendChild(rect);
            svg.appendChild(line1);
            svg.appendChild(line2);
    }
    return svg;
}

function renderBoardsList() {
    boardsList.innerHTML = '';
    const boardEntries = Object.entries(boards);
    const pinnedBoards = boardEntries.filter(([id, board]) => board.pinned);
    const unpinnedBoards = boardEntries.filter(([id, board]) => !board.pinned);
    const sortedBoards = [...pinnedBoards, ...unpinnedBoards];

    sortedBoards.forEach(([boardId, board]) => {
        const boardItem = document.createElement('li');
        boardItem.className = 'sidebar-listItem';
        if (boardId === currentBoardId) {
            boardItem.classList.add('active');
        }
        boardItem.setAttribute('data-board-id', boardId);

        const link = document.createElement('a');
        const iconSVG = getIconSVG(board.icon);
        const span = document.createElement('span');
        span.className = 'sidebar-listItemText';
        span.textContent = board.name;

        const boardActions = document.createElement('div');
        boardActions.className = 'board-actions';
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'board-action-btn delete-board-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = 'Delete board';
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            confirmDeleteBoard(boardId);
        });
        boardActions.appendChild(deleteBtn);

        link.appendChild(iconSVG);
        link.appendChild(span);
        link.appendChild(boardActions);
        boardItem.appendChild(link);

        link.addEventListener('click', function(e) {
            if (e.target.closest('.board-action-btn')) return;
            e.preventDefault();
            document.querySelectorAll('.sidebar-listItem').forEach(li => li.classList.remove('active'));
            boardItem.classList.add('active');
            currentBoardId = boardId;
            renderBoard();
            updateBoardTitle();
        });

        boardsList.appendChild(boardItem);
    });
}

function startListRename(listId) {
    const list = boards[currentBoardId].lists.find(l => l.id === listId);
    if (!list) return;

    const column = document.querySelector(`.column[data-list-id="${listId}"]`);
    if (!column) return;

    const columnTitleContainer = column.querySelector('.column-title-container');
    const columnTitle = column.querySelector('.column-title');
    const deleteListBtn = column.querySelector('.delete-list-btn');

    // Prevent multiple simultaneous renames
    if (columnTitleContainer.querySelector('.column-title-input')) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'column-title-input';
    input.value = list.title;

    // Hide original title and insert input
    columnTitle.style.display = 'none';
    columnTitleContainer.insertBefore(input, columnTitle);

    input.focus();
    input.select();

    let inputRemoved = false; // ✅ Guard flag

    const finishRename = function() {
        if (inputRemoved) return; // ✅ EARLY EXIT — prevents double removal
        inputRemoved = true; // ✅ Mark as removed IMMEDIATELY

        const newName = input.value.trim();
        if (newName && newName !== list.title) {
            list.title = newName;
            saveBoards();
        }

        // Restore original title
        columnTitle.textContent = list.title;
        columnTitle.style.display = 'block';

        // ✅ Remove input — only if it still exists
        if (input.parentNode) {
            input.parentNode.removeChild(input);
        }

        // ✅ Re-attach delete button and pin icon if needed
        if (deleteListBtn) deleteListBtn.style.display = 'block'; // Just in case
    };

    // Handle blur (clicking away)
    input.addEventListener('blur', function() {
        finishRename();
    });

    // Handle Enter key
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishRename();
        } else if (e.key === 'Escape') {
            e.preventDefault(); // ✅ Prevent default behavior
            finishRename();     // ✅ Same handler — safe now
        }
    });

    // ✅ Optional: Also prevent form submission if inside a form
    input.addEventListener('submit', function(e) {
        e.preventDefault();
        finishRename();
    });
}

function editCard(listId, cardId) {
    const list = boards[currentBoardId].lists.find(l => l.id === listId);
    if (!list) return;
    const card = list.cards.find(c => c.id === cardId);
    if (!card) return;

    cardToEdit = { listId, cardId };
    editCardTitle.value = card.title;
    editCardDescription.value = card.description || '';
    editCardModal.classList.add('active');
    setTimeout(() => editCardTitle.focus(), 100);
}

function showAddCardForm(listId) {
    const column = document.querySelector(`.column[data-list-id="${listId}"]`);
    if (!column) return;
    const existingForm = column.querySelector('.add-card-form');
    if (existingForm) existingForm.remove();
    const cardList = column.querySelector('.card-list');
    if (!cardList) return;
    const addCardArea = cardList.querySelector('.add-card-area');
    if (addCardArea) addCardArea.remove();

    const addCardForm = document.createElement('div');
    addCardForm.className = 'add-card-form';
    addCardForm.innerHTML = `
        <input type="text" class="card-title-input" placeholder="Task title" maxlength="100" />
        <textarea placeholder="Description (optional)"></textarea>
        <div class="form-actions">
            <button class="btn btn-secondary cancel-add">Cancel</button>
            <button class="btn btn-primary add-card">Add Card</button>
        </div>
    `;
    cardList.insertBefore(addCardForm, cardList.firstChild);

    const titleInput = addCardForm.querySelector('.card-title-input');
    const descriptionInput = addCardForm.querySelector('textarea');
    const cancelBtn = addCardForm.querySelector('.cancel-add');
    const addCardBtn = addCardForm.querySelector('.add-card');

    setTimeout(() => titleInput.focus(), 100);

    // ✅ Define handleEscKey function HERE — now it's in scope
    function handleEscKey(e) {
        if (e.key === 'Escape') {
            addCardForm.remove();
            if (cardList.children.length === 0) {
                const addCardArea = document.createElement('div');
                addCardArea.className = 'add-card-area';
                addCardArea.textContent = 'Click the + button to add a card';
                cardList.appendChild(addCardArea);
            }
            document.removeEventListener('keydown', handleEscKey); // ✅ Clean up
        }
    }

    const addCard = function() {
        const title = titleInput.value.trim();
        if (title) {
            const newCard = {
                id: 'card-' + Date.now(),
                title: title,
                description: descriptionInput.value.trim(),
                createdAt: new Date().toISOString(),
                position: 0, // ✅ Ensures it sorts to top
                pinned: false
            };
            const listIndex = boards[currentBoardId].lists.findIndex(list => list.id === listId);
            if (listIndex !== -1) {
                boards[currentBoardId].lists[listIndex].cards.unshift(newCard); // ✅ Insert at top
                saveBoards();
                renderBoard();
            }
        } else {
            titleInput.style.borderColor = 'var(--delete-color)';
            setTimeout(() => titleInput.style.borderColor = '', 2000);
            titleInput.focus();
        }
    };

    addCardBtn.addEventListener('click', addCard);
    titleInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            addCard();
        }
    });

    cancelBtn.addEventListener('click', function() {
        addCardForm.remove();
        if (cardList.children.length === 0) {
            const addCardArea = document.createElement('div');
            addCardArea.className = 'add-card-area';
            addCardArea.textContent = 'Click the + button to add a card';
            cardList.appendChild(addCardArea);
        }
        document.removeEventListener('keydown', handleEscKey); // ✅ Clean up on cancel too
    });
}

function confirmDeleteList(listId) {
    listToDelete = listId;
    deleteListModal.classList.add('active');
}

function confirmDeleteBoard(boardId) {
    boardToDelete = boardId;
    deleteBoardModal.classList.add('active');
}

function handleDragStart(e) {
    if (!e.target.classList.contains('card')) return;
    if (!boards[currentBoardId]) {
        console.error("Current board not found during drag start:", currentBoardId);
        return;
    }
    draggedCard = e.target;
    dragStartListId = draggedCard.getAttribute('data-list-id');
    dragStartIndex = parseInt(draggedCard.getAttribute('data-index'));
    draggedCard.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    isDragging = true; // ✅ SET FLAG
}

function handleDragEnd(e) {
    if (draggedCard) {
        draggedCard.classList.remove('dragging');
        draggedCard = null;
        dragStartListId = null;
        dragStartIndex = -1;
        isDragging = false; // ✅ CLEAR FLAG
    }
    if (currentHighlight) {
        currentHighlight.classList.remove('highlight');
        currentHighlight = null;
    }
    document.querySelectorAll('.column').forEach(col => col.classList.remove('highlight'));
}

function handleDragOver(e) {
    e.preventDefault();
    if (!draggedCard) return;

    const isDropTarget = e.target.closest('.card-list') || 
                         e.target.closest('.column') || 
                         e.target.classList.contains('add-card-area');
    if (isDropTarget) {
        e.dataTransfer.dropEffect = 'move';
    } else {
        e.dataTransfer.dropEffect = 'none';
    }
}

function handleDragEnter(e) {
    if (!draggedCard) return;

    // ✅ Only consider the drop target if it's the actual card-list container
    const targetCardList = e.target.closest('.card-list');
    if (!targetCardList) return;

    const targetColumn = targetCardList.closest('.column');
    if (!targetColumn) return;

    // ✅ Only highlight if it's a *different* list than the current one
    if (currentHighlight !== targetColumn) {
        // ✅ Remove highlight from previous list
        if (currentHighlight) {
            currentHighlight.classList.remove('highlight');
        }
        // ✅ Highlight the new one
        currentHighlight = targetColumn;
        currentHighlight.classList.add('highlight');
    }
}

function handleDragLeave(e) {
    // ✅ Only unhighlight if the leave is from the current highlight
    if (currentHighlight && !e.currentTarget.contains(e.relatedTarget)) {
        currentHighlight.classList.remove('highlight');
        currentHighlight = null; // ✅ Reset
    }
}

function handleDrop(e) {
    e.preventDefault();
    if (!draggedCard) return;

    if (!boards[currentBoardId]) {
        console.error("Current board not found:", currentBoardId);
        return;
    }

    let targetListElement = null;
    let targetListId = null;

    const droppedElement = e.target;

    if (droppedElement.classList.contains('card-list')) {
        targetListElement = droppedElement;
        targetListId = targetListElement.getAttribute('data-list-id');
    }
    else if (droppedElement.closest('.card')) {
        const cardElement = droppedElement.closest('.card');
        targetListElement = cardElement.parentElement;
        targetListId = targetListElement.getAttribute('data-list-id');
    }
    else if (droppedElement.closest('.column')) {
        const column = droppedElement.closest('.column');
        targetListElement = column.querySelector('.card-list');
        targetListId = targetListElement.getAttribute('data-list-id');
    }
    else if (droppedElement.classList.contains('column')) {
        targetListElement = droppedElement.querySelector('.card-list');
        targetListId = targetListElement.getAttribute('data-list-id');
    }

    if (!targetListElement || !targetListId) {
        console.log("No valid target list found for drop");
        return;
    }

const cardId = draggedCard.getAttribute('data-card-id');
console.log("Dropping card", cardId, "from list", dragStartListId, "to list", targetListId);

// ✅ 1. Find source list index
const sourceListIndex = boards[currentBoardId].lists.findIndex(list => list.id === dragStartListId);
if (sourceListIndex === -1) {
    console.error("Source list not found:", dragStartListId);
    return;
}

// ✅ 2. Find card index in source list
const cardIndex = boards[currentBoardId].lists[sourceListIndex].cards.findIndex(card => card.id === cardId);
if (cardIndex === -1) {
    console.error("Card not found in source list:", cardId);
    return;
}

// ✅ 3. Get the card object
const card = boards[currentBoardId].lists[sourceListIndex].cards[cardIndex];

// ✅ 4. Find target list index — THIS WAS MISSING!
const targetListIndex = boards[currentBoardId].lists.findIndex(list => list.id === targetListId);
if (targetListIndex === -1) {
    console.error("Target list not found:", targetListId);
    return;
}

// ✅ 5. Remove from source
boards[currentBoardId].lists[sourceListIndex].cards.splice(cardIndex, 1);

// ✅ 6. Add to target
const targetList = boards[currentBoardId].lists[targetListIndex]; // ✅ Now targetListIndex is defined!
card.position = targetList.cards.length; // Set position to end of list
targetList.cards.push(card);

// ✅ 7. Re-sort cards by position after move
targetList.cards.sort((a, b) => a.position - b.position);

    saveBoards();
    renderBoard();
    document.querySelectorAll('.column').forEach(col => col.classList.remove('highlight'));
}

// ✅ Initialize Settings Page Interactivity
function initializeSettingsPage() {
    const settingsThemeToggle = document.getElementById('settingsThemeToggle');
    if (!settingsThemeToggle) {
        console.warn("settingsThemeToggle not found in settings.html");
        return;
    }

    // Sync theme toggle with current state
    settingsThemeToggle.checked = document.body.classList.contains('dark');

    settingsThemeToggle.addEventListener('change', function() {
        document.body.classList.toggle('dark');
        // ✅ Use the same toggle element — no need for themeToggle or themeLabel
        localStorage.setItem('darkTheme', this.checked);
    });
}


// Global zoom state
let currentZoom = parseFloat(localStorage.getItem(`zoom-${currentBoardId}`)) || 1;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 1.8;

// Apply zoom on load
document.documentElement.style.setProperty('--zoom', currentZoom);

function handleWheel(e) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();

    // Calculate new zoom level
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    let newZoom = currentZoom + delta;
    newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

    if (newZoom !== currentZoom) {
        currentZoom = newZoom;
        // Update CSS variable
        document.documentElement.style.setProperty('--zoom', currentZoom);
        // Save per board
        localStorage.setItem(`zoom-${currentBoardId}`, currentZoom);
        // Optional: update zoom indicator
        const zoomIndicator = document.getElementById('zoom-indicator');
        if (zoomIndicator) {
            zoomIndicator.textContent = Math.round(currentZoom * 100) + '%';
        }
    }
}

if (resetZoomBtn) {
    resetZoomBtn.addEventListener('click', function() {
        currentScale = 1;
        // ✅ Apply saved zoom level to kanban board only
        const kanbanBoard = document.getElementById('kanbanBoard');
        // if (kanbanBoard) {
        //     kanbanBoard.style.transform = `scale(${currentScale})`;
        //     kanbanBoard.style.transformOrigin = 'top left';
        // }
        localStorage.setItem(`zoom-${currentBoardId}`, 1);
        const zoomIndicator = document.getElementById('zoom-indicator');
        if (zoomIndicator) {
            zoomIndicator.textContent = '100%';
        }
    });
}

// ======================
// UTILITY FUNCTIONS
// ======================
function createElementFromHTML(htmlString) {
    if (!htmlString || typeof htmlString !== 'string') {
        console.error("Invalid HTML string passed to createElementFromHTML:", htmlString);
        return null;
    }
    const div = document.createElement('div');
    div.innerHTML = htmlString.trim();
    return div.firstElementChild || null; // Always return null if no child
}

// ======================
// INITIALIZE APP
// ======================
async function initializeApp() {
    console.log("DOM fully loaded. Starting initialization...");

    await new Promise(resolve => setTimeout(resolve, 50));

    // Assign static elements
    sidebarContainer = document.getElementById('sidebarContainer');
    sidebarToggle = document.getElementById('sidebarToggle');
    // themeToggle = document.getElementById('themeToggle');
    // themeLabel = document.getElementById('themeLabel');
    addListBtn = document.getElementById('addListBtn');
    addBoardBtn = document.getElementById('addBoardBtn');
    addListModal = document.getElementById('addListModal');
    addBoardModal = document.getElementById('addBoardModal');
    deleteListModal = document.getElementById('deleteListModal');
    deleteBoardModal = document.getElementById('deleteBoardModal');
    editCardModal = document.getElementById('editCardModal');
    listNameInput = document.getElementById('listNameInput');
    boardNameInput = document.getElementById('boardNameInput');
    editCardTitle = document.getElementById('editCardTitle');
    editCardDescription = document.getElementById('editCardDescription');
    createListBtn = document.getElementById('createListBtn');
    createBoardBtn = document.getElementById('createBoardBtn');
    confirmDeleteListBtn = document.getElementById('confirmDeleteListBtn');
    confirmDeleteBoardBtn = document.getElementById('confirmDeleteBoardBtn');
    saveEditCard = document.getElementById('saveEditCard');
    boardTitle = document.getElementById('boardTitle');
    boardsList = document.getElementById('boardsList');
    closeAddListModal = document.getElementById('closeAddListModal');
    closeAddBoardModal = document.getElementById('closeAddBoardModal');
    closeEditCardModal = document.getElementById('closeEditCardModal');
    cancelAddList = document.getElementById('cancelAddList');
    cancelAddBoard = document.getElementById('cancelAddBoard');
    cancelDeleteList = document.getElementById('cancelDeleteList');
    cancelDeleteBoard = document.getElementById('cancelDeleteBoard');
    cancelEditCard = document.getElementById('cancelEditCard');
    settingsBtn = document.getElementById('settingsBtn');


    if (!boardsList || !addListBtn) {
        console.error("CRITICAL: Missing essential UI elements. Check base.html.");
        return;
    }

    // ✅ Initialize zoom functionality AFTER DOM is ready
    const resetZoomBtn = document.getElementById('resetZoomBtn');
    const appContainer = document.getElementById('app');

    // ✅ Apply saved zoom level to kanban board only
    // ✅ Apply saved zoom level to kanban board only
    const kanbanBoard = document.getElementById('kanbanBoard');
    // if (kanbanBoard) {
    //     kanbanBoard.style.transform = `scale(${currentScale})`;
    //     kanbanBoard.style.transformOrigin = 'top left';
    // }

    if (appContainer) {
        appContainer.addEventListener('wheel', handleWheel, { passive: false });
    }

    // ✅ LOAD FROM SQLITE — NO JSON PARSE NEEDED
    await loadBoards();

    if (!boards[currentBoardId] && Object.keys(boards).length > 0) {
        currentBoardId = Object.keys(boards)[0];
    }

    // Load theme
    try {
        if (localStorage.getItem('darkTheme') === 'true') {
            document.body.classList.add('dark');
            // Note: themeToggle and themeLabel are commented out in your code
            // Uncomment the assignments above if you want to use them
        }
    } catch (e) {}

    sidebarToggle.addEventListener('click', function() {
        sidebarContainer.classList.toggle('shrink');
    });

    // ✅ Settings button handler
    settingsBtn.addEventListener('click', async function() {
        // Hide all boards by clearing the app container
        const appContainer = document.getElementById('app');
        const boardTitle = document.getElementById('boardTitle');

        // Show settings title
        boardTitle.textContent = 'Settings';
        addListBtn.style.display = 'none'; // ✅ HIDE the + button

        // Load and display settings.html
        try {
            const settingsHtml = await fetch('settings.html').then(r => r.text());
            appContainer.innerHTML = settingsHtml;

            // Initialize settings page interactivity
            initializeSettingsPage();
        } catch (err) {
            appContainer.innerHTML = '<div style="color: red; padding: 20px;">Failed to load settings.</div>';
            console.error("Failed to load settings.html:", err);
        }
    });

    // ======================
    // ENTER KEY FUNCTIONALITY FOR MODALS
    // ======================
    addListBtn.addEventListener('click', function() {
        listNameInput.value = '';
        addListModal.classList.add('active');
        setTimeout(() => listNameInput.focus(), 100);
    });

    addBoardBtn.addEventListener('click', function() {
        boardNameInput.value = '';
        addBoardModal.classList.add('active');
        setTimeout(() => boardNameInput.focus(), 100);
    });

    listNameInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const listName = listNameInput.value.trim();
            if (listName) {
                const newList = {
                    id: 'list-' + Date.now(),
                    title: listName,
                    cards: [],
                    position: 0
                };
                boards[currentBoardId].lists.push(newList);
                saveBoards();
                renderBoard();
                addListModal.classList.remove('active');
            }
        }
    });

    boardNameInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const boardName = boardNameInput.value.trim();
        if (boardName) {
            const newBoardId = 'board-' + Date.now();
            const newBoard = {
                id: newBoardId,
                name: boardName,
                icon: 'board',
                pinned: false,
                lists: [
                    { id: 'todo-' + newBoardId, title: 'To Do', cards: [] },
                    { id: 'in-progress-' + newBoardId, title: 'In Progress', cards: [] },
                    { id: 'completed-' + newBoardId, title: 'Completed', cards: [] }
                ]
            };

            // ✅ Insert new board at the top (after pinned boards)
            const updatedBoards = {};
            updatedBoards[newBoardId] = newBoard; // ✅ New board goes first

            // Copy all existing boards (excluding the new one)
            Object.keys(boards).forEach(key => {
                if (key !== newBoardId) {
                    updatedBoards[key] = boards[key];
                }
            });

            boards = updatedBoards; // ✅ Replace entire boards object
            currentBoardId = newBoardId;
            saveBoards();
            renderBoardsList();
            renderBoard();
            updateBoardTitle();
            addBoardModal.classList.remove('active');
        }
    }
});

    editCardTitle.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEditCard.click();
        }
    });

    editCardDescription.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            saveEditCard.click();
        }
    });

    createListBtn.addEventListener('click', function() {
        const listName = listNameInput.value.trim();
        if (listName) {
            const newList = {
                id: 'list-' + Date.now(),
                title: listName,
                cards: []
            };
            boards[currentBoardId].lists.push(newList);
            saveBoards();
            renderBoard();
            addListModal.classList.remove('active');
        }
    });

    createBoardBtn.addEventListener('click', function() {
    const boardName = boardNameInput.value.trim();
    if (boardName) {
        const newBoardId = 'board-' + Date.now();
        const newBoard = {
            id: newBoardId,
            name: boardName,
            icon: 'board',
            pinned: false,
            lists: [
                { id: 'todo-' + newBoardId, title: 'To Do', cards: [] },
                { id: 'in-progress-' + newBoardId, title: 'In Progress', cards: [] },
                { id: 'completed-' + newBoardId, title: 'Completed', cards: [] }
            ]
        };

        // ✅ Insert new board at the top (after pinned boards)
        // We'll reconstruct the boards object with newBoard first
        const updatedBoards = {};
        updatedBoards[newBoardId] = newBoard; // ✅ New board goes first

        // Now copy all existing boards (excluding the new one)
        Object.keys(boards).forEach(key => {
            if (key !== newBoardId) {
                updatedBoards[key] = boards[key];
            }
        });

        boards = updatedBoards; // ✅ Replace entire boards object
        currentBoardId = newBoardId;
        saveBoards();
        renderBoardsList();
        renderBoard();
        updateBoardTitle();
        addBoardModal.classList.remove('active');
    }
});

    [closeAddListModal, closeAddBoardModal, closeEditCardModal, 
     cancelAddList, cancelAddBoard, cancelDeleteList, cancelDeleteBoard, cancelEditCard].forEach(button => {
        button.addEventListener('click', function() {
            addListModal.classList.remove('active');
            addBoardModal.classList.remove('active');
            deleteListModal.classList.remove('active');
            deleteBoardModal.classList.remove('active');
            editCardModal.classList.remove('active');
        });
    });

    [addListModal, addBoardModal, deleteListModal, deleteBoardModal, editCardModal].forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });

    confirmDeleteListBtn.addEventListener('click', function() {
        if (listToDelete) {
            boards[currentBoardId].lists = boards[currentBoardId].lists.filter(list => list.id !== listToDelete);
            saveBoards();
            renderBoard();
            deleteListModal.classList.remove('active');
            listToDelete = null;
        }
    });

    confirmDeleteBoardBtn.addEventListener('click', function() {
        if (boardToDelete) {
            if (Object.keys(boards).length <= 1) {
                alert("You cannot delete the last board. Create a new one first.");
                return;
            }
            delete boards[boardToDelete];
            if (currentBoardId === boardToDelete) {
                currentBoardId = Object.keys(boards)[0];
            }
            saveBoards();
            renderBoardsList();
            renderBoard();
            updateBoardTitle();
            deleteBoardModal.classList.remove('active');
            boardToDelete = null;
        }
    });

    saveEditCard.addEventListener('click', function() {
        if (cardToEdit) {
            const title = editCardTitle.value.trim();
            if (title) {
                const list = boards[currentBoardId].lists.find(l => l.id === cardToEdit.listId);
                if (list) {
                    const card = list.cards.find(c => c.id === cardToEdit.cardId);
                    if (card) {
                        card.title = title;
                        card.description = editCardDescription.value.trim();
                        saveBoards();
                        renderBoard();
                        editCardModal.classList.remove('active');
                    }
                }
            }
        }
    });

    document.addEventListener('click', function(e) {
    if (e.target.classList.contains('delete-card')) {
        const card = e.target.closest('.card');
        const listId = card.getAttribute('data-list-id');
        const cardId = card.getAttribute('data-card-id');
        
        // ✅ Update the data model IMMEDIATELY
        const listIndex = boards[currentBoardId].lists.findIndex(list => list.id === listId);
        if (listIndex !== -1) {
            boards[currentBoardId].lists[listIndex].cards = 
                boards[currentBoardId].lists[listIndex].cards.filter(card => card.id !== cardId);
            
            // ✅ SAVE the updated data
            saveBoards();
            
            // ✅ RE-RENDER THE BOARD IMMEDIATELY to reflect the change in the DOM
            renderBoard();
            
            // ✅ Optional: If you want a visual fade effect, you can animate the card before removing it from the DOM
            // But the re-render will handle the correct positioning
            card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            card.style.opacity = '0';
            card.style.transform = 'translateX(100%)';
            
            // Remove the card element from the DOM after the animation completes
            setTimeout(() => {
                if (card.parentNode) {
                    card.parentNode.removeChild(card);
                }
            }, 300);
        }
    }
});

    renderBoardsList();
    updateBoardTitle();
    renderBoard();
    console.log("✅ App initialized successfully!");
}

document.addEventListener('DOMContentLoaded', initializeApp);