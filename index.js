const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

// Initialize express app
const app = express();

// Middleware to parse JSON data from the request body
app.use(express.json());

// Set the path to ffmpeg and ffprobe
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Serve static files from the 'uploads' and 'public' folders
app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));

// Set storage engine with multer (destination and filename configuration)
const storage = multer.diskStorage({
  destination: './uploads',
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

// Initialize multer for uploading multiple files (limit to 6 files)
const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Only accept .wav files
    checkFileType(file, cb);
  }
}).array('wavfiles', 6);  // Limit to 6 files with fieldname 'wavfiles'

// Check file type
function checkFileType(file, cb) {
  // Allowed extensions
  const filetypes = /wav/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb('Error: WAV files only!');
  }
}

// Create an uploads folder if it doesn't exist
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// Route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/public/index.html'));
});
app.get('/styles.css', (req, res) => {
  res.sendFile(path.join(__dirname, '/styles.css'));
});

// Define the POST route to handle multiple file uploads
app.post('/upload', (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      res.send({ success: false, message: err });
    } else {
      if (req.files === undefined || req.files.length === 0) {
        res.send({ success: false, message: 'No files selected!' });
      } 
			else {
        // Send back the paths of the uploaded .wav files
        const filePaths = req.files.map(file => `/uploads/${file.filename}`);
        res.send({
          success: true,
          message: 'Files uploaded successfully!',
          filePaths: filePaths
        });
      }
    }
  });
});

// Define the POST route to handle combining .wav files
app.post('/combine', (req, res) => {
  const { filePaths } = req.body;

  if (!filePaths || filePaths.length === 0) {
    return res.status(400).send({ success: false, message: 'No files provided to combine.' });
  }

  const combinedFileName = `combined-${Date.now()}.wav`;
  const combinedFilePath = `./uploads/${combinedFileName}`;

  // Create an FFmpeg command to combine the uploaded .wav files
  const ffmpegCommand = ffmpeg();

  filePaths.forEach(filePath => {
    const fullPath = path.join(__dirname, filePath);
    ffmpegCommand.input(fullPath);
  });

  // Concatenate the .wav files and save to a new file
  ffmpegCommand
    .on('error', (err) => {
      console.error('Error combining files:', err.message);
      res.status(500).send({ success: false, message: 'Error combining files' });
    })
    .on('end', () => {
      console.log('Files successfully combined');
      res.send({
        success: true,
        message: 'Files combined successfully!',
        combinedFilePath: `/uploads/${combinedFileName}`
      });
    })
    .mergeToFile(combinedFilePath);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
