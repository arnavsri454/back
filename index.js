import express from 'express';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3500;
const ADMIN = 'Admin';

const app = express();

// In-memory storage for chat messages
const chatHistory = {}; // Maps room names to an array of messages

// Configure Multer for image uploads
const storage = multer.diskStorage({
    destination: path.join(__dirname, 'public/uploads'),
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}_${file.originalname}`);
    }
});
const upload = multer({ storage });

// Enable CORS
app.use(cors({
    origin: [
        'http://127.0.0.1:5501',
        'http://localhost:5501',
        'https://chat-app-jwaw.onrender.com'
    ],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
}));

// Serve static files (public folder)
app.use(express.static(path.join(__dirname, 'public')));

// Image upload route
app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl });
});

const expressServer = app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});

// Initialize Socket.io
const io = new Server(expressServer, {
    cors: {
        origin: [
            'http://127.0.0.1:5501',
            'http://localhost:5501',
            'https://chat-app-jwaw.onrender.com'
        ],
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        credentials: true
    }
});

// Main code for managing chat
io.on('connection', (socket) => {
    console.log(`User ${socket.id} connected`);

    // Handle 'joinRoom' event
    socket.on('joinRoom', ({ name, room }) => {
        console.log(`${name} is joining room ${room}`);
        socket.join(room);

        // Send the chat history for the room to the new user
        const history = chatHistory[room] || [];
        socket.emit('chatHistory', history);

        // Notify others in the room that a user has joined
        socket.to(room).emit('message', {
            name: ADMIN,
            text: `${name} has joined the room.`,
            time: new Date().toLocaleTimeString()
        });

        // Send a welcome message
        socket.emit('message', {
            name: ADMIN,
            text: `Welcome to the room ${room}`,
            time: new Date().toLocaleTimeString()
        });
    });

    // Handle regular text messages
    socket.on('message', ({ name, text, room }) => {
        console.log(`Message from ${name}: ${text}`);

        // Store the message in the chat history for the room
        if (!chatHistory[room]) {
            chatHistory[room] = [];
        }

        const message = { name, text, time: new Date().toLocaleTimeString() };
        chatHistory[room].push(message);

        // Broadcast the message to all users in the room
        io.to(room).emit('message', message);
    });

    // Handle image messages
    socket.on('imageMessage', ({ name, imageUrl, room }) => {
        console.log(`Image from ${name}: ${imageUrl}`);

        // Store the image message in the chat history for the room
        if (!chatHistory[room]) {
            chatHistory[room] = [];
        }

        const message = {
            name,
            text: `<img src="${imageUrl}" alt="Shared image" class="shared-image"/>`,
            time: new Date().toLocaleTimeString()
        };
        chatHistory[room].push(message);

        // Broadcast the image message to all users in the room
        io.to(room).emit('message', message);
    });

    socket.on('disconnect', () => {
        console.log(`User ${socket.id} disconnected`);
    });
});
