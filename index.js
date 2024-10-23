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
      } else {
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

// Function to get the duration of an audio file using ffprobe
function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        return reject(err);
      }
      resolve(metadata.format.duration);
    });
  });
}

// Function to pad a file with silence using the apad filter
function padWithSilence(inputFile, outputFile, duration, maxDuration) {
	console.log("padWithSilence");
	console.log("inputFile:" + inputFile);
	console.log("outputFile:" + outputFile);
	console.log("duration:" + duration);
	console.log("maxDuration:" + maxDuration);

  return new Promise((resolve, reject) => {
    const silenceDuration = maxDuration - duration;
    if (silenceDuration > 0) {
      ffmpeg(inputFile)
        .audioFilter(`apad=pad_dur=${silenceDuration}`)
        .outputOptions([`-t ${maxDuration}`])  // Ensure the output is exactly the max duration
        .on('end', () => {
          console.log(`Padded file generated: ${outputFile}`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`Error generating padded file: ${err.message}`);
          reject(err);
        })
        .save(outputFile);
    } else {
      // No padding needed if duration matches
      resolve();
    }
  });
}

// // Function to concatenate two .wav files
// function concatenateFiles(input1, input2, output) {
// 	console.log("concatenateFiles");
//   return new Promise((resolve, reject) => {
//     ffmpeg()
//       .input(input1)
//       .input(input2)
//       .complexFilter('[0:a][1:a]concat=n=2:v=0:a=1[a]')
//       .outputOptions(['-map [a]'])
//       .on('end', resolve)
//       .on('error', reject)
//       .save(output);
//   });
// }

// Define the POST route to handle combining .wav files
app.post('/combine', async (req, res) => {
  const { filePaths } = req.body;

  if (!filePaths || filePaths.length === 0) {
    return res.status(400).send({ success: false, message: 'No files provided to combine.' });
  }

  try {
    // Get the duration of each audio file
    const fileDurations = await Promise.all(filePaths.map(filePath => getAudioDuration(path.join(__dirname, filePath))));

    // Determine the longest duration
    const maxDuration = Math.max(...fileDurations);
		const totalDuration = fileDurations.reduce((a,b)=>a+b); // JS sum

    // Pad shorter files with silence to match the max duration
    const paddedFilePaths = await Promise.all(filePaths.map(async (filePath, index) => {
      const fullPath = path.join(__dirname, filePath);
      const duration = fileDurations[index];
      const paddedFilePath = fullPath.replace('.wav', '-padded.wav');
			console.log("duration: " + duration);
			console.log("maxDuration: " + maxDuration);
      if (duration < maxDuration) {
				await padWithSilence(fullPath, paddedFilePath, duration, maxDuration);
        

				// const silenceFilePath = fullPath.replace('.wav', '-silence.wav');
				// await padWithSilence(fullPath, paddedFilePath, duration, maxDuration);
				// console.log("padWithSilence 183 complete");
        // await concatenateFiles(fullPath, silenceFilePath, paddedFilePath);

				return paddedFilePath;
      }
      return fullPath;
    }));

    

    // Combine the files (6 segments)
    const combinedFileName = `combined-${Date.now()}.wav`;
		const newCombinedFileName = `combined-new-${Date.now()}.wav`;
    const combinedFilePath = `./uploads/${combinedFileName}`;
		const newCombinedFilePath = `./uploads/${newCombinedFileName}`;
    const ffmpegCommand = ffmpeg();

    paddedFilePaths.forEach(filePath => {
      ffmpegCommand.input(filePath);
    });

    // Concatenate the .wav files and save to a new file
    ffmpegCommand
      .on('error', (err) => {
        console.error('Error combining files:', err.message);
        res.status(500).send({ success: false, message: 'Error combining files' });
      })
      .on('end', () => {
        console.log('Files successfully combined');
        

				// padWithSilence(inputFile, outputFile, duration, maxDuration) {
				if (paddedFilePaths.length < 6) {
					console.log("less than 6 files provided, adding silence to end");
					const totalCombinedFileLength = maxDuration * 6;
					const silenceDuration = totalCombinedFileLength - totalDuration;
					const newInputFile = path.join(__dirname, `/uploads/${combinedFileName}`);
					ffmpeg(newInputFile)
						.audioFilter(`apad=pad_dur=${silenceDuration}`)
						.outputOptions([`-t ${totalCombinedFileLength}`])  // Ensure the output is exactly the max duration
						.on('end', () => {
							console.log(`Padded file generated: ${newCombinedFilePath}`);
							
							res.send({
								success: true,
								message: 'Files combined successfully!',
								combinedFilePath: `${newCombinedFilePath}`
							});

						})
						.on('error', (err) => {
							console.error(`Error adding silence to combined file: ${err.message}`);
							reject(err);
						})
						.save(newCombinedFilePath);
				}
				else {
					res.send({
						success: true,
						message: 'Files combined successfully!',
						combinedFilePath: `/uploads/${combinedFileName}`
					});
				}

				// // If there were fewer than 6 files, add silence to the combined file to make 6 total segments
				// if (paddedFilePaths.length < 6) {
				// 	for (let i = paddedFilePaths.length; i<6; i++) { // should be <= ?
				// 		await padWithSilence(combinedFilePath, newCombinedFilePath, totalDuration, maxDuration * 6);
				// 	}
				// }
      })
      .mergeToFile(combinedFilePath);

			

  } catch (error) {
    console.error('Error processing audio files:', error.message);
    res.status(500).send({ success: false, message: 'Error processing audio files' });
  }

	
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
