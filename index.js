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

// Chat history storage
const chatHistory = {};

// Multer setup
const storage = multer.diskStorage({
    destination: path.join(__dirname, 'public/uploads'),
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}_${file.originalname}`);
    }
});
const upload = multer({ storage });

// CORS setup
app.use(cors({
    origin: 'https://front-gemg.onrender.com',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Image upload endpoint
app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl });
});

// Start the Express server
const expressServer = app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});

// Socket.IO setup
const io = new Server(expressServer, {
    cors: {
        origin: 'https://front-gemg.onrender.com',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        credentials: true
    }
});

io.on('connection', (socket) => {
    console.log(`User ${socket.id} connected`);

    socket.on('joinRoom', ({ name, room }) => {
        socket.join(room);
        socket.emit('chatHistory', chatHistory[room] || []);
        socket.to(room).emit('message', { name: ADMIN, text: `${name} joined`, time: new Date().toLocaleTimeString() });
    });

    socket.on('message', ({ name, text, room }) => {
        const message = { name, text, time: new Date().toLocaleTimeString() };
        if (!chatHistory[room]) chatHistory[room] = [];
        chatHistory[room].push(message);
        io.to(room).emit('message', message);
    });

    socket.on('disconnect', () => {
        console.log(`User ${socket.id} disconnected`);
    });
});

