import express from 'express';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import multer from 'multer';
import helmet from 'helmet';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chatDB';
const ADMIN = 'Admin';

const app = express();

// Security Middleware
app.use(helmet());

// CORS Configuration
app.use(cors({
    origin: 'https://front-gemg.onrender.com', // Allow frontend requests
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true,
}));

// MongoDB Connection
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

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
    destination: path.join(__dirname, 'public/uploads'),
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
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

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
        origin: 'https://front-gemg.onrender.com',
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
        activeUsers[socket.id] = { name, room };

        // Fetch and send previous messages
        const messages = await Message.find({ room }).sort({ time: 1 }).limit(50);
        socket.emit('chatHistory', messages);

        // Notify users
        io.to(room).emit('message', {
            name: ADMIN,
            text: `${name} has joined the room.`,
            time: new Date().toLocaleTimeString(),
        });

        // Update Active Users List
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

    // Handle Audio Calls (WebRTC Signaling)
    socket.on('callUser', ({ to, signal, from, name }) => {
        io.to(to).emit('incomingCall', { signal, from, name });
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

