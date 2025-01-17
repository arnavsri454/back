import express from 'express';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 10000; // Ensure Render uses the correct port
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
app.use(
    cors({
        origin: ['https://front-gemg.onrender.com'], // Add your frontend Render URL
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        credentials: true,
    })
);

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

// Start Express server
const expressServer = app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

// Initialize Socket.io with CORS settings
const io = new Server(expressServer, {
    cors: {
        origin: ['https://front-gemg.onrender.com'], // Add your frontend Render URL
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        credentials: true,
    },
});

// Main socket.io logic
io.on('connection', (socket) => {
    console.log(`User ${socket.id} connected`);

    // Handle 'joinRoom' event
    socket.on('joinRoom', ({ name, room }) => {
        console.log(`User ${name} joined room ${room}`);
        socket.join(room);

        // Send chat history to the new user
        const history = chatHistory[room] || [];
        socket.emit('chatHistory', history);

        // Notify other users in the room
        socket.to(room).emit('message', {
            name: ADMIN,
            text: `${name} has joined the room.`,
            time: new Date().toLocaleTimeString(),
        });

        // Send welcome message to the user
        socket.emit('message', {
            name: ADMIN,
            text: `Welcome to the room ${room}`,
            time: new Date().toLocaleTimeString(),
        });
    });

    // Handle text messages
    socket.on('message', ({ name, text, room }) => {
        console.log(`Message from ${name} in room ${room}: ${text}`);
        if (!chatHistory[room]) chatHistory[room] = [];

        const message = { name, text, time: new Date().toLocaleTimeString() };
        chatHistory[room].push(message);

        // Broadcast message to the room
        io.to(room).emit('message', message);
    });

    // Handle image messages
    socket.on('imageMessage', ({ name, imageUrl, room }) => {
        console.log(`Image from ${name} in room ${room}: ${imageUrl}`);
        if (!chatHistory[room]) chatHistory[room] = [];

        const message = {
            name,
            text: `<img src="${imageUrl}" alt="Shared image" class="shared-image"/>`,
            time: new Date().toLocaleTimeString(),
        };
        chatHistory[room].push(message);

        // Broadcast image message to the room
        io.to(room).emit('message', message);
    });

    // Handle user disconnect
    socket.on('disconnect', (reason) => {
        console.log(`User ${socket.id} disconnected. Reason: ${reason}`);
    });
});
