import express from 'express';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 10000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://front-gemg.onrender.com';

// Initialize Express App
const app = express();
app.use(helmet());
app.use(cors({
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
}));

// Start Express Server
const expressServer = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

// Initialize Socket.io
const io = new Server(expressServer, {
    cors: {
        origin: FRONTEND_URL,
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

// Active Users
const activeUsers = {};

// Handle Socket.io Events
io.on('connection', (socket) => {
    console.log(`🔗 User connected: ${socket.id}`);

    // User joins room
    socket.on('joinRoom', ({ name, room }) => {
        socket.join(room);
        activeUsers[socket.id] = { name, room, id: socket.id };

        // Emit the updated user list only to room members
        io.to(room).emit('activeUsers', Object.values(activeUsers).filter(user => user.room === room));
    });

    // Start Group Call (Restrict to Room)
    socket.on('startGroupCall', ({ room }) => {
        if (!room) return;

        // Get only users in the same room
        const roomUsers = Object.values(activeUsers).filter(user => user.room === room && user.id !== socket.id);

        if (roomUsers.length > 0) {
            io.to(room).emit('groupCallStarted', { roomUsers });
        }
    });

    // WebRTC Signaling
    socket.on('sendOffer', ({ to, offer }) => io.to(to).emit('receiveOffer', { from: socket.id, offer }));
    socket.on('sendAnswer', ({ to, answer }) => io.to(to).emit('receiveAnswer', { from: socket.id, answer }));
    socket.on('sendICE', ({ to, candidate }) => io.to(to).emit('receiveICE', { from: socket.id, candidate }));

    // Handle Disconnect
    socket.on('disconnect', () => {
        const user = activeUsers[socket.id];
        if (user) {
            delete activeUsers[socket.id];
            io.to(user.room).emit('userDisconnected', { userId: socket.id });
        }
        console.log(`❌ User disconnected: ${socket.id}`);
    });
});
