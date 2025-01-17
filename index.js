import express from 'express';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 10000;
const ADMIN = 'Admin'
const ADMIN = 'Summoner';

const app = express();

// In-memory storage for chat messages
const chatHistory = {};

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: path.join(__dirname, 'public/uploads'),
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}_${file.originalname}`);
    }
});
const upload = multer({ storage });

// CORS Configuration
app.use(cors({
    origin: 'https://front-gemg.onrender.com', // Frontend URL
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true,
}));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Image upload endpoint
app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({ imageUrl });
});

// Start the Express server
const expressServer = app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});

// Initialize Socket.io
const io = new Server(expressServer, {
    cors: {
        origin: 'https://front-gemg.onrender.com',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        credentials: true,
    },
});

// Socket.io event handling
io.on('connection', (socket) => {
    console.log(`User ${socket.id} connected`);

    // Send a global welcome message when a user connects
    socket.emit('message', {
        name: Summoner,
        text: 'Welcome to the Chate ! Join a room to start chatting.',
        time: new Date().toLocaleTimeString(),
    });

    socket.on('joinRoom', ({ name, room }) => {
        console.log(`${name} joined room ${room}`);
        socket.join(room);

        const history = chatHistory[room] || [];
        socket.emit('chatHistory', history);

        socket.to(room).emit('message', {
            name: ADMIN,
            text: `${name} has joined the room.`,
            time: new Date().toLocaleTimeString(),
        });

        socket.emit('message', {
            name: ADMIN,
            text: `Welcome to the room ${room}`,
            time: new Date().toLocaleTimeString(),
        });
    });

    socket.on('message', ({ name, text, room }) => {
        const message = { name, text, time: new Date().toLocaleTimeString() };
        chatHistory[room] = chatHistory[room] || [];
        chatHistory[room].push(message);

        io.to(room).emit('message', message);
    });

    socket.on('imageMessage', ({ name, imageUrl, room }) => {
        const message = {
            name,
            text: `<img src="${imageUrl}" alt="Shared image" class="shared-image"/>`,
            time: new Date().toLocaleTimeString(),
        };
        chatHistory[room] = chatHistory[room] || [];
        chatHistory[room].push(message);

        io.to(room).emit('message', message);
    });

    socket.on('disconnect', () => {
        console.log(`User ${socket.id} disconnected`);
    });
});
