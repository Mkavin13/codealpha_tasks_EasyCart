const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

const errorHandlingIdx = content.indexOf('// ==================== ERROR HANDLING ====================');
const imagesRouteIdx = content.indexOf('// Get product images');

if (errorHandlingIdx !== -1 && imagesRouteIdx !== -1 && imagesRouteIdx > errorHandlingIdx) {
    const mainPart = content.substring(0, errorHandlingIdx);
    const errorHandlingPart = content.substring(errorHandlingIdx, imagesRouteIdx);
    const misplacedRoutesPart = content.substring(imagesRouteIdx);

    const newContent = mainPart + misplacedRoutesPart + '\n' + errorHandlingPart;
    fs.writeFileSync('server.js', newContent);
    console.log('Fixed server.js route order');
} else {
    console.log('No fix needed or markers not found');
}
