const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;  // Import ffprobe-static

// Initialize express app
const app = express();

// Set the path to ffmpeg and ffprobe
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);  // Set ffprobe path

// Serve static files from the 'uploads' folder
app.use('/uploads', express.static('uploads'));

// Set storage engine with multer (destination and filename configuration)
const storage = multer.diskStorage({
  destination: './uploads',  // Where files will be saved
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

// Initialize upload variable (for multiple files)
const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Only accept .wav files
    checkFileType(file, cb);
  }
}).array('wavfiles', 10);  // Accept up to 10 files with fieldname 'wavfiles'

// Check file type
function checkFileType(file, cb) {
  // Allowed extensions
  const filetypes = /wav/;
  // Check extension
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  // Check MIME type
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

// Define a route to render an upload form
app.get('/', (req, res) => {
  res.send(`
    <h1>Upload Multiple .wav Files</h1>
    <form method="POST" enctype="multipart/form-data" action="/upload">
      <input type="file" name="wavfiles" accept=".wav" multiple />
      <button type="submit">Upload and Combine</button>
    </form>
  `);
});

// Function to concatenate WAV files using ffmpeg
function concatWavFiles(filePaths, outputFilePath, callback) {
  const ffmpegCommand = ffmpeg();

  // Add each file to the ffmpeg input
  filePaths.forEach(filePath => {
    ffmpegCommand.input(filePath);
  });

  // Set output options and merge files
  ffmpegCommand
    .on('error', function (err) {
      console.error('Error concatenating files:', err.message);
      callback(err);
    })
    .on('end', function () {
      console.log('Files have been concatenated successfully.');
      callback(null);
    })
    .mergeToFile(outputFilePath);
}

// Define the POST route to handle file uploads and combine them
app.post('/upload', (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      res.send(`<p>${err}</p>`);
    } else {
      if (req.files === undefined || req.files.length === 0) {
        res.send('<p>No files selected!</p>');
      } else {
        // Get the paths of the uploaded files
        const filePaths = req.files.map(file => `./uploads/${file.filename}`);

        // Output path for the combined file
        const outputFilePath = './uploads/combined.wav';

        // Concatenate the .wav files using ffmpeg
        concatWavFiles(filePaths, outputFilePath, (error) => {
          if (error) {
            res.send(`<p>Error combining files: ${error.message}</p>`);
          } else {
            res.send(`
              <p>Files uploaded and combined successfully!</p>
              <audio controls>
                <source src="/uploads/combined.wav" type="audio/wav">
                Your browser does not support the audio element.
              </audio>
              <br/>
              <a href="/uploads/combined.wav" download="combined.wav">Download Combined File</a>
              <br/>
              <a href="/">Upload more files</a>
            `);
          }
        });
      }
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
