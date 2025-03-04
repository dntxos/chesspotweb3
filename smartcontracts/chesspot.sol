// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ChessPot {
    address public signer; // Endereço autorizado a assinar as vitórias
    address public owner;  // Endereço do proprietário do contrato

    struct Room {
        uint256 pot;      // Valor acumulado no pote
        bool gameOver;    // Indica se o jogo terminou
        address winner;   // Endereço do vencedor
    }

    mapping(string => Room) public rooms; // Mapeia roomId para informações da sala

    constructor(address _signer) {
        signer = _signer; // Define o endereço que assinará as vitórias
        owner = msg.sender; // Define o proprietário do contrato
    }

    // Adiciona BNB ao pote de uma sala
    function addToPot(string memory roomId) public payable {
        require(!rooms[roomId].gameOver, "Game is over");
        require(msg.value > 0, "Must send BNB");
        rooms[roomId].pot += msg.value;
    }

    // Permite ao vencedor sacar o pote com uma assinatura válida
    function claimPot(string memory roomId, address winner, bytes memory signature) public {
        require(!rooms[roomId].gameOver, "Game already claimed");
        require(verifySignature(roomId, winner, signature), "Invalid signature");

        rooms[roomId].gameOver = true;
        rooms[roomId].winner = winner;

        payable(winner).transfer(rooms[roomId].pot);
    }

    // Verifica se a assinatura é válida
    function verifySignature(string memory roomId, address winner, bytes memory signature) public view returns (bool) {
        bytes32 message = keccak256(abi.encodePacked(roomId, winner));
        bytes32 prefixedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message));
        address recoveredSigner = recoverSigner(prefixedHash, signature);
        return recoveredSigner == signer;
    }

    // Função auxiliar para recuperar o assinante da assinatura
    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _signature) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);
        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    // Função auxiliar para dividir a assinatura em r, s e v
    function splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "Invalid signature length");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }

    // Permite verificar o saldo do pote de uma sala (leitura)
    function getPot(string memory roomId) public view returns (uint256) {
        return rooms[roomId].pot;
    }

    // Função de saque de emergência
    function emergencyWithdraw() public {
        require(msg.sender == owner, "Only the owner can withdraw");
        payable(owner).transfer(address(this).balance);
    }
}