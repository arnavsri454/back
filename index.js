import express from 'express';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Path and server configuration
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;

// Initialize Express App
const app = express();

// Security Middleware
app.use(helmet());

// CORS Configuration
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://front-gemg.onrender.com';
app.use(cors({
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
}));

// MongoDB Connection
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err.message));

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
        io.to(room).emit('activeUsers', Object.values(activeUsers));
    });

    // Start Group Call
    socket.on('startGroupCall', () => {
        const room = activeUsers[socket.id]?.room;
        if (room) {
            io.to(room).emit('groupCallStarted', { from: socket.id, roomUsers: Object.values(activeUsers).filter(user => user.room === room) });
        }
    });

    // WebRTC Signaling
    socket.on('sendOffer', ({ to, offer }) => {
        io.to(to).emit('receiveOffer', { from: socket.id, offer });
    });

    socket.on('sendAnswer', ({ to, answer }) => {
        io.to(to).emit('receiveAnswer', { from: socket.id, answer });
    });

    socket.on('sendICE', ({ to, candidate }) => {
        io.to(to).emit('receiveICE', { from: socket.id, candidate });
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
        const user = activeUsers[socket.id];
        if (user) {
            delete activeUsers[socket.id];
            io.to(user.room).emit('activeUsers', Object.values(activeUsers));
            io.to(user.room).emit('userDisconnected', { userId: socket.id });
        }
        console.log(`❌ User disconnected: ${socket.id}`);
    });
});
