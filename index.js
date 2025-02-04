 import express from 'express';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import multer from 'multer';
import helmet from 'helmet';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config(); // Load environment variables

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chatDB';
const ADMIN = process.env.ADMIN || 'Admin';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://front-gemg.onrender.com'; // Use env var for frontend URL

const app = express();

// Security Middleware
app.use(helmet());

// CORS Configuration
app.use(cors({
    origin: FRONTEND_URL, // Allow frontend requests from env variable
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true,
}));

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// MongoDB Connection
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err.message)); // More descriptive error message

// Message Schema (Auto-delete after 7 days)
const messageSchema = new mongoose.Schema({
    name: String,
    text: String,
    room: String,
    time: { type: Date, default: Date.now, expires: '7d' },
});
const Message = mongoose.model('Message', messageSchema);

// Active Users
const activeUsers = {};

// File Upload Configuration (Images Only)
const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}_${file.originalname}`);
    }
});

const fileFilter = (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only images are allowed!'), false);
    }
    cb(null, true);
};

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Max: 5MB
    fileFilter,
});

// Serve uploaded images
app.use('/uploads', express.static(uploadDir));

// Image Upload Endpoint
app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({ imageUrl });
});

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

// Socket.io Events
io.on('connection', (socket) => {
    console.log(`🔗 User connected: ${socket.id}`);

    // Send welcome message
    socket.emit('message', {
        name: ADMIN,
        text: 'Welcome to the Chat App! Join a room to start chatting.',
        time: new Date().toLocaleTimeString(),
    });

    // Join Room
    socket.on('joinRoom', async ({ name, room }) => {
        socket.join(room);
        activeUsers[socket.id] = { name, room, id: socket.id };

        // Fetch and send previous messages
        const messages = await Message.find({ room }).sort({ time: 1 }).limit(50);
        socket.emit('chatHistory', messages);

        // Notify users
        io.to(room).emit('message', {
            name: ADMIN,
            text: `${name} has joined the room.`,
            time: new Date().toLocaleTimeString(),
        });

        io.to(room).emit('activeUsers', Object.values(activeUsers));
    });

    // Handle Chat Messages
    socket.on('message', async ({ name, text, room }) => {
        const message = new Message({ name, text, room });
        await message.save();
        io.to(room).emit('message', message);
    });

    // Handle Image Messages
    socket.on('imageMessage', async ({ name, imageUrl, room }) => {
        const message = new Message({ name, text: `<img src="${imageUrl}" alt="Shared image" class="shared-image"/>`, room });
        await message.save();
        io.to(room).emit('message', message);
    });

    // Handle WebRTC Call Signaling
    socket.on('callUser', ({ to, signal, from }) => {
        if (io.sockets.sockets.get(to)) {
            io.to(to).emit('incomingCall', { signal, from, name: activeUsers[from]?.name });
        }
    });

    socket.on('answerCall', ({ to, signal }) => {
        io.to(to).emit('callAccepted', signal);
    });

    // Handle Disconnections
    socket.on('disconnect', () => {
        const user = activeUsers[socket.id];
        if (user) {
            delete activeUsers[socket.id];
            io.to(user.room).emit('activeUsers', Object.values(activeUsers));
        }
        console.log(`❌ User disconnected: ${socket.id}`);
    });
});
