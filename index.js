const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// In-memory data store for parties and users
const parties = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join_party', ({ partyId, username, isHost, videoUrl }) => {
    socket.join(partyId);
    
    if (!parties[partyId]) {
      parties[partyId] = {
        id: partyId,
        hostId: isHost ? socket.id : null,
        videoUrl: videoUrl || '',
        participants: [],
      };
    }
    
    // Ensure the host's video URL takes precedence if they join
    if (isHost) {
      parties[partyId].hostId = socket.id;
      if (videoUrl) {
        parties[partyId].videoUrl = videoUrl;
      }
    }

    const participant = { id: socket.id, username, isHost: parties[partyId].hostId === socket.id };
    
    const existingIndex = parties[partyId].participants.findIndex(p => p.id === socket.id);
    if (existingIndex === -1) {
      parties[partyId].participants.push(participant);
    } else {
      parties[partyId].participants[existingIndex] = participant;
    }

    // Broadcast the fully updated party state to EVERYONE in the room
    io.to(partyId).emit('party_state', parties[partyId]);

    console.log(`User ${username} joined party ${partyId}`);
  });

  socket.on('send_message', ({ partyId, message, username }) => {
    io.to(partyId).emit('receive_message', {
      id: uuidv4(),
      username,
      message,
      timestamp: new Date().toISOString()
    });
  });

  // Video Syncing Events
  socket.on('play_video', ({ partyId, time }) => {
    socket.to(partyId).emit('video_played', { time });
  });

  socket.on('pause_video', ({ partyId, time }) => {
    socket.to(partyId).emit('video_paused', { time });
  });

  socket.on('seek_video', ({ partyId, time }) => {
    socket.to(partyId).emit('video_seeked', { time });
  });

  socket.on('change_video_url', ({ partyId, url }) => {
    if (parties[partyId]) {
      parties[partyId].videoUrl = url;
      io.to(partyId).emit('video_url_changed', { url });
    }
  });

  // WebRTC Signaling
  socket.on('webrtc_offer', ({ targetId, offer, callerId }) => {
    io.to(targetId).emit('webrtc_offer', { offer, callerId });
  });

  socket.on('webrtc_answer', ({ targetId, answer }) => {
    io.to(targetId).emit('webrtc_answer', { answer, responderId: socket.id });
  });

  socket.on('webrtc_ice_candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('webrtc_ice_candidate', { candidate, senderId: socket.id });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // Clean up parties
    for (const partyId in parties) {
      const party = parties[partyId];
      const participantIndex = party.participants.findIndex(p => p.id === socket.id);
      
      if (participantIndex !== -1) {
        const participant = party.participants[participantIndex];
        party.participants.splice(participantIndex, 1);
        io.to(partyId).emit('user_left', { id: socket.id, username: participant.username });
        
        if (party.participants.length === 0) {
          delete parties[partyId];
        } else if (party.hostId === socket.id) {
          // Reassign host if host leaves
          party.hostId = party.participants[0].id;
          party.participants[0].isHost = true;
          io.to(partyId).emit('party_state', party);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Socket.io Server running on port ${PORT}`);
});
