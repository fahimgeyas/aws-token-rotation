const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const output = fs.createWriteStream(path.join(__dirname, '../dist/deployment-package.zip'));
const archive = archiver('zip', { zlib: { level: 9 } });

archive.pipe(output);

// Add Lambda handler and dependencies
archive.directory(path.join(__dirname, '../dist'), false);

archive.finalize()
    .then(() => console.log('Package created: dist/deployment-package.zip'))
    .catch(err => {
        console.error('Error creating package:', err);
        process.exit(1);
    });