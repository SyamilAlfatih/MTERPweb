const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subDir = 'misc';
    
    if (file.fieldname === 'groupPhoto') {
      subDir = 'attendance-sessions';
    } else if (file.fieldname.includes('photo') || file.fieldname === 'photo') {
      subDir = 'photos';
    } else if (
      file.fieldname.includes('Document') || 
      file.fieldname.includes('Drawing') ||
      file.fieldname === 'certificate' ||
      file.fieldname === 'educationProof' ||
      file.fieldname === 'evidence' ||
      file.fieldname === 'document' ||
      file.fieldname === 'file'
    ) {
      subDir = 'documents';
    }
    
    const fullDir = path.join(uploadsDir, subDir);
    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }
    
    cb(null, fullDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Accept images
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  }
  // Accept PDFs
  else if (file.mimetype === 'application/pdf') {
    cb(null, true);
  }
  // Accept documents, spreadsheets, and CSVs
  else if (
    file.mimetype.includes('document') || 
    file.mimetype.includes('spreadsheet') ||
    file.mimetype.includes('excel') ||
    file.mimetype.includes('csv') ||
    file.mimetype === 'text/plain' ||
    file.originalname.match(/\.(xlsx|xls|csv)$/i)
  ) {
    cb(null, true);
  }
  else {
    cb(new Error('Invalid file type. Allowed: images, PDFs, spreadsheets (.xlsx, .csv), and documents'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

module.exports = upload;
