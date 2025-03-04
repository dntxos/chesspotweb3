const socket = io('http://localhost:3000');



let board;
let gameStarted = false;
let playerColor = '';
let provider, signer, contract, userAddress, currentRoomId, winnerSignature;

const contractAddress = '0xb8Ce6D86731f22759FbC84B23698446918d3Fcc4'; // Substitua pelo endereço do contrato implantado
const contractABI = [
    // ABI do contrato ChessPot (gere com Remix ou outra ferramenta após compilar)
    "function addToPot(string memory roomId) public payable",
    "function claimPot(string memory roomId, address winner, bytes memory signature) public",
    "function getPot(string memory roomId) public view returns (uint256)"
];

document.addEventListener('DOMContentLoaded', () => {
    board = ChessBoard('board', {
        draggable: true,
        position: 'start',
        onDrop: onDrop
    });

    hideControls();
    setupSocketListeners();
    setInterval(updatePotValue, 10000); // Atualiza o valor do pote a cada 10 segundos
});

function hideControls() {
    document.getElementById('controls').style.display = 'none';
    document.getElementById('pot-controls').style.display = 'none';
}

function showRoomControls() {
    document.getElementById('controls').style.display = 'flex';
}

function showPotControls() {
    document.getElementById('pot-controls').style.display = 'block';
}

async function connectWallet() {
    if (window.ethereum) {
        hideControls();
        provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();
        contract = new ethers.Contract(contractAddress, contractABI, signer);
        document.getElementById('walletStatus').textContent = `Carteira: ${userAddress}`;
        socket.emit('setAddress', userAddress); // Envia o endereço ao servidor
        showRoomControls();
    } else {
        alert('Por favor, instale a MetaMask!');
    }
}

async function addToPot() {
    if (!contract) {
        alert('Conecte a MetaMask primeiro!');
        return;
    }
    const roomId = document.getElementById('roomId').value || document.getElementById('joinRoomId').value;
    const amount = document.getElementById('potAmount').value;
    if (!roomId || !amount) {
        alert('Preencha o ID da sala e a quantidade de BNB!');
        return;
    }
    try {
        const tx = await contract.addToPot(roomId, { value: ethers.parseEther(amount) });
        await tx.wait();
        updateStatus(`Adicionado ${amount} BNB ao pote da sala ${roomId}`);
    } catch (e) {
        updateStatus('Erro ao adicionar ao pote: ' + e.message);
    }
}

async function claimPot() {
    if (!contract || !winnerSignature || !currentRoomId) {
        alert('Você precisa ser o vencedor e ter a assinatura!');
        return;
    }
    try {
        const tx = await contract.claimPot(currentRoomId, userAddress, winnerSignature);
        await tx.wait();
        updateStatus('Pote sacado com sucesso!');
        document.getElementById('claimPotBtn').style.display = 'none';
    } catch (e) {
        updateStatus('Erro ao sacar o pote: ' + e.message);
    }
}

async function updatePotValue() {
    if (!contract || !currentRoomId) {
        document.getElementById('potValue').textContent = 'Valor do Pote: 0 BNB';
        return;
    }
    try {
        const potValue = await contract.getPot(currentRoomId);
        const potValueInBNB = ethers.formatEther(potValue);
        document.getElementById('potValue').textContent = `Valor do Pote: ${potValueInBNB} BNB`;
    } catch (e) {
        console.error('Erro ao buscar o valor do pote:', e);
    }
}

function createRoom() {
    const roomId = document.getElementById('roomId').value;
    const password = document.getElementById('password').value;
    currentRoomId = roomId;
    socket.emit('createRoom', { roomId, password, playerId: userAddress });
}

function joinRoom() {
    const roomId = document.getElementById('joinRoomId').value;
    const password = document.getElementById('joinPassword').value;
    currentRoomId = roomId;
    socket.emit('joinRoom', { roomId, password, playerId: userAddress });
}

function setupSocketListeners() {
    socket.on('roomCreated', (data) => {
        updateStatus(`Sala ${data.roomId} criada! Aguardando oponente...`);
        board.position(data.fen);
        updatePotValue();
        document.getElementById('controls').style.display = 'none';
        showPotControls();
    });

    socket.on('roomJoined', (data) => {
        updateStatus(`Conectado à sala ${data.roomId}!`);
        board.position(data.fen);
        updatePotValue();
        document.getElementById('controls').style.display = 'none';
        showPotControls();
    });

    socket.on('playerColor', (color) => {
        playerColor = color;
        updateStatus(`Você é ${color === 'white' ? 'Brancas' : 'Pretas'}.`);
    });

    socket.on('gameStart', (data) => {
        gameStarted = true;
        document.getElementById('controls').style.display = 'none';
        updateStatus('Jogo iniciado!');
        board.position(data.fen);
    });

    socket.on('moveMade', (data) => {
        board.position(data.fen);
        updateStatus(data.gameOver 
            ? 'Jogo terminado!' 
            : `${data.turn === 'w' ? 'Brancas' : 'Pretas'} para jogar${data.inCheck ? ' (em xeque)' : ''}`);
    });

    socket.on('gameEnd', (data) => {
        updateStatus(`Fim de jogo! Vencedor: ${data.winner === 'white' ? 'Brancas' : 'Pretas'}`);
        gameStarted = false;
        
        updatePotValue();

        // Se o jogador for o vencedor, exibe o botão para sacar o pote
        if (data.signature && data.roomId) {
            winnerSignature = data.signature;
            currentRoomId = data.roomId;
            document.getElementById('claimPotBtn').style.display = 'block';
        }
    });

    socket.on('roomError', (error) => {
        updateStatus(`Erro: ${error}`);
    });

    socket.on('invalidMove', (error) => {
        updateStatus(error);
    });

    socket.on('playerDisconnected', () => {
        updateStatus('Oponente desconectado!');
        gameStarted = false;
        showRoomControls();
    });
}

function onDrop(source, target) {
    if (!gameStarted) return 'snapback';
    const move = { from: source, to: target };
    socket.emit('move', { roomId: currentRoomId, move });
    return 'snapback';
}

function updateStatus(message) {
    document.getElementById('status').textContent = message;
}