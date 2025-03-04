const express = require('express');
const ethers = require('ethers');
const http = require('http');
const socketIo = require('socket.io');
const { Chess } = require('chess.js');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const cors = require('cors');

const fs = require('fs');
const path = require('path');

const frontendPath = path.join(__dirname, '../frontend');
const ROOMS_FILE = path.join(__dirname, 'rooms.json');

function updateProductionUrl() {
    if (process.env.replaceurl) {
        console.log('Substituindo URL de desenvolvimento por URL de produção...');
        const frontendPath = path.join(__dirname, '../frontend');
        const indexHtml = fs.readFileSync(path.join(frontendPath, 'app.js'), 'utf-8');
        const updatedHtml = indexHtml.replace('http://localhost:3000', process.env.replaceurl);

        fs.writeFileSync(path.join(frontendPath, 'app.js'), updatedHtml);
    }
}

function updateProductionContractAddress() {
    if (process.env.contractaddress) {
        console.log('Substituindo endereço do contrato por endereço de produção...');
        const frontendPath = path.join(__dirname, '../frontend');
        const indexHtml = fs.readFileSync(path.join(frontendPath, 'app.js'), 'utf-8');
        const updatedHtml = indexHtml.replace('0xb8Ce6D86731f22759FbC84B23698446918d3Fcc4', process.env.contractaddress);

        fs.writeFileSync(path.join(frontendPath, 'app.js'), updatedHtml);
    }
}

function saveRoomsToFile() {
    const data = {};
    for (const [roomId, room] of rooms) {
        data[roomId] = {
            password: room.password,
            fen: room.chess.fen(),
            players: room.players.map(p => ({
                playerId: p.playerId,
                address: p.address
            }))
        };
    }
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(data, null, 2));
}

function loadRoomsFromFile() {
    if (fs.existsSync(ROOMS_FILE)) {
        const data = JSON.parse(fs.readFileSync(ROOMS_FILE));
        for (const roomId in data) {
            const roomData = data[roomId];
            const room = new GameRoom(roomId, roomData.password);
            room.chess = new Chess(roomData.fen);
            room.players = roomData.players.map(player => ({
                playerId: player.playerId,
                address: player.address,
                socket: null // Socket será associado na reconexão
            }));
            rooms.set(roomId, room);
        }
    }
}

function checkWinner(room, roomId) {
    try {
        if (room.chess.isGameOver()) {
            const winnerColor = room.chess.turn() === 'w' ? 'black' : 'white';
            const winnerIndex = winnerColor === 'white' ? 0 : 1;
            const winnerAddress = room.players[winnerIndex].address;
    
            generateSignature(roomId, winnerAddress).then(signature => {
                io.to(room.players[winnerIndex].socket?.id).emit('gameEnd', {
                    winner: winnerColor,
                    signature,
                    roomId
                });
            });
    
            io.to(roomId).emit('gameEnd', { winner: winnerColor });
        }
    } catch (error) {
        console.log(error);
        
    }
}

// Chave privada do signer (mantenha segura e nunca exponha no código público!)

// else crime cricket inhale asset someone gate embark scissors member corn liquid siren rebuild nation few impulse turtle wrist frown cause account mean insane
const privateKey = process.env.privatekey;
const publicAddress = process.env.publicaddress;

const wallet = new ethers.Wallet(privateKey);

// Função para gerar a assinatura
async function generateSignature(roomId, winnerAddress) {
    const message = ethers.solidityPackedKeccak256(['string', 'address'], [roomId, winnerAddress]);
    return await wallet.signMessage(ethers.getBytes(message));
}

updateProductionUrl();
updateProductionContractAddress();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // Permitir qualquer origem
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Use o middleware cors
app.use(cors()); // Adicione esta linha

app.use(express.static(frontendPath));
// ./img/chesspieces/wikipedia/bP.png
app.use('/img/chesspieces/wikipedia/', express.static(path.join(frontendPath, '/img/chesspieces/wikipedia')));


// Configuração do Swagger
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Chess Backend API',
            version: '1.0.0',
            description: 'API para gerenciamento de salas de xadrez online'
        },
        servers: [
            { url: `http://localhost:${PORT}` }
        ]
    },
    apis: ['./src/routes/*.js']
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Middleware
app.use(express.json());

// Objeto para armazenar as salas de jogo
const rooms = new Map();

class GameRoom {
    constructor(roomId, password = null) {
        this.roomId = roomId;
        this.password = password;
        this.players = []; // Array de { socket, playerId, address }
        this.chess = new Chess();
    }

    addPlayer(socket, playerId, address) {
        if (this.players.length < 2) {
            this.players.push({ socket, playerId, address });
            socket.join(this.roomId);
            return true;
        }
        return false;
    }

    removePlayer(socket) {
        this.players = this.players.filter(p => p.socket !== socket);
        socket.leave(this.roomId);
    }
}

// Rotas da API
const gameRoutes = require('./routes/gameRoutes');
app.use('/api', gameRoutes(rooms));

// Configuração do Socket.IO
io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    socket.on('createRoom', ({ roomId, password, playerId }) => {
        if (rooms.has(roomId)) {
            socket.emit('roomError', 'Sala já existe');
            return;
        }
    
        const room = new GameRoom(roomId, password);
        rooms.set(roomId, room);
        room.addPlayer(socket, playerId, socket.address); // Usa o address já definido, se houver
    
        socket.emit('roomCreated', { roomId, fen: room.chess.fen() });
        socket.emit('playerColor', 'white');
        saveRoomsToFile(); // Salva ao criar a sala
    });

    socket.on('joinRoom', ({ roomId, password, playerId }) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('roomError', 'Sala não existe');
            return;
        }
    
        if (room.password && room.password !== password) {
            socket.emit('roomError', 'Senha incorreta');
            return;
        }
    
        const playerIndex = room.players.findIndex(p => p.playerId === playerId);
        if (playerIndex !== -1) {
            // Reconecta o jogador existente
            room.players[playerIndex].socket = socket;
            socket.join(roomId);
            socket.emit('roomJoined', { roomId, fen: room.chess.fen() });
            const color = playerIndex === 0 ? 'white' : 'black';
            socket.emit('playerColor', color);
        } else if (room.players.length < 2) {
            // Adiciona novo jogador
            room.addPlayer(socket, playerId, socket.address);
            socket.emit('roomJoined', { roomId, fen: room.chess.fen() });
            const color = room.players.length === 1 ? 'white' : 'black';
            socket.emit('playerColor', color);
            if (room.players.length === 2) {
                io.to(roomId).emit('gameStart', { fen: room.chess.fen() });
            }
            saveRoomsToFile(); // Salva ao adicionar novo jogador
        } else {
            socket.emit('roomError', 'Sala cheia');
        }

        try {
            checkWinner(room, roomId);
        } catch (error) {
            console.log(error);
        }
    });

    socket.on('move', ({ roomId, move }) => {
        const room = rooms.get(roomId);
        if (!room) return;
    
        const playerIndex = room.players.findIndex(p => p.socket === socket);
        if (playerIndex === -1) return;
        const playerColor = playerIndex === 0 ? 'w' : 'b';
        if (room.chess.turn() !== playerColor) {
            socket.emit('invalidMove', 'Não é seu turno');
            return;
        }
    
        try {
            move.promotion = 'q'; // Promover para dama
            const result = room.chess.move(move);
            if (result) {
                const gameState = {
                    fen: room.chess.fen(),
                    turn: room.chess.turn(),
                    inCheck: room.chess.inCheck(),
                    gameOver: room.chess.isGameOver()
                };
                io.to(roomId).emit('moveMade', gameState);
    
                checkWinner(room, roomId);
                saveRoomsToFile(); // Salva após cada movimento
            }
        } catch (e) {
            socket.emit('invalidMove', 'Movimento inválido');
        }
    });

    socket.on('setAddress', (address) => {
        socket.address = address; // Armazena o endereço da carteira do jogador
    });

    socket.on('disconnect', () => {
        for (const [roomId, room] of rooms) {
            if (room.players.includes(socket)) {
                room.removePlayer(socket);
                io.to(roomId).emit('playerDisconnected');
                if (room.players.length === 0) {
                    //rooms.delete(roomId);
                }
                break;
            }
        }
        console.log('Jogador desconectado:', socket.id);
    });
});

loadRoomsFromFile();
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Documentação Swagger disponível em http://localhost:${PORT}/api-docs`);
});


