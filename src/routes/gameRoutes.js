const express = require('express');

module.exports = (rooms) => {
    const router = express.Router();

    /**
     * @swagger
     * /api/rooms:
     *   get:
     *     summary: Lista todas as salas disponíveis
     *     responses:
     *       200:
     *         description: Lista de salas
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 type: object
     *                 properties:
     *                   roomId:
     *                     type: string
     *                   hasPassword:
     *                     type: boolean
     *                   playerCount:
     *                     type: integer
     */
    router.get('/rooms', (req, res) => {
        const roomList = Array.from(rooms.entries()).map(([roomId, room]) => ({
            roomId,
            hasPassword: !!room.password,
            playerCount: room.players.length
        }));
        res.json(roomList);
    });

    /**
     * @swagger
     * /api/rooms/{roomId}:
     *   get:
     *     summary: Obtém informações de uma sala específica
     *     parameters:
     *       - in: path
     *         name: roomId
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: Detalhes da sala
     *       404:
     *         description: Sala não encontrada
     */
    router.get('/rooms/:roomId', (req, res) => {
        const room = rooms.get(req.params.roomId);
        if (!room) {
            return res.status(404).json({ error: 'Sala não encontrada' });
        }
        res.json({
            roomId: room.roomId,
            hasPassword: !!room.password,
            playerCount: room.players.length,
            fen: room.chess.fen()
        });
    });

    return router;
};
