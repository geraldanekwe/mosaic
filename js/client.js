'use strict';
let handleUpload = (e) => {
  const file = document.getElementById('input').files[0];
  const reader = new FileReader();
  const canvas = document.getElementById('img-canvas');
  const context = canvas.getContext('2d');
  const mosaic = document.getElementById('mosaic');
  mosaic.innerHTML = '';
  if (context) {
    reader.onload = (event) => {
      let img, imgData, isValidRatio, tilesInRow, tilesInColumn, tileDimension, tiles = [];
      img = new Image();
      img.src = event.target.result;
      img.addEventListener('load', function (event) {
        const { width, height } = img;
        canvas.width = width;
        canvas.height = height;
        context.drawImage(img, 0, 0);
        imgData = context.getImageData(0, 0, width, height);

        isValidRatio = checkAspectRatio(width, height);
        if (!isValidRatio) {
          mosaic.innerHTML += '<span>Please select an image with a valid aspect ratio. (e.g. 1:1 | 3:2 | 4:3 | 16:9 | 21:9)</span>';
          return;
        }

        tileDimension = getTileDimensions(width, height);
        tilesInRow = Math.floor(width / tileDimension);
        tilesInColumn = Math.floor(height / tileDimension);

        tiles = imgToTiles({ context, tileDimension, tilesInRow, tilesInColumn, width, height });
        tiles = getAverageRGB(tiles);
        tiles = rgbToHex(tiles);
        renderTileRow({ mosaic, tiles, tilesInRow }, { index: 0, count: 0 });
      });
    } // end reader.onload
  } // end if context
  reader.readAsDataURL(file);
}

let checkAspectRatio = (width, height) => {
  if (width === height) {
    return true;
  }
  //this function checks if the image has a compatible aspect ratio
  let ratios = [3/2, 4/3, 16/9, 21/9];
  //if width is less than height, swap values to ensure proper calculation
  if (width < height) {
    [width, height] = [height, width]
  }
  //check for valid ratio then convert the variable to boolean
  return ratios.some(ratio => width/height === ratio);
}

let imgToTiles = ({ context, tileDimension, tilesInRow, tilesInColumn, width, height }) => {
  //this function divides the image evenly into tiles
  //the tilesInRow/tilesInColumn variables are used to calculate x,y coordinates in the image
  //NOTE: additional information about this method can be found here:
  // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData
  let tiles = [];
  for (let i = 0; i < tilesInColumn; i++) {
    for (let j = 0; j < tilesInRow; j++) {
      let x = j*tileDimension, y = i*tileDimension, tileDimensionX, tileDimensionY;
      tileDimensionX = tileDimension;
      tileDimensionY = tileDimension;

      //this accounts for any trailing pixels at the edge of a rectangle
      if (((tilesInRow - 1) === j) && ((width - x) !== tileDimension)) {
        tileDimensionX = (width - x);
      }
      if (((tilesInColumn - 1) === i) && ((height - y) !== tileDimension)) {
        tileDimensionY = (height - y);
      }

      tiles.push({
        x, y,
        imgData: context.getImageData(x, y, tileDimensionX, tileDimensionY)
      });
    }
  }

  return tiles;
}

let rgbToHex = (tiles) => {
  //this function converts rgb values to hex
  //NOTE: additional information about this method can be found here:
  // http://stackoverflow.com/questions/5623838/rgb-to-hex-and-hex-to-rgb
  return tiles.map(tile => {
    let { rgb: { r, g, b }, x, y } = tile;
    let R = r.toString(16).length === 1 ? `0${r.toString(16)}` : r.toString(16);
    let G = g.toString(16).length === 1 ? `0${g.toString(16)}` : g.toString(16);
    let B = b.toString(16).length === 1 ? `0${b.toString(16)}` : b.toString(16);

    return { hex: `${R}${G}${B}`, x, y };
  });
}

let getTileDimensions = (width, height) => {
  //this function determines the size of the tile in pixels relative to the image
  //tile size is less than or equal to 5% of the width and/or height to achieve
  //an optimal mosaic effect.
  if (width === height) {
    //if the image is a square
    return width * .05;
  }
  //if width is less than height, swap values to ensure proper calculation
  if (width < height) {
    [width, height] = [height, width];
  }
  //if the image is a rectangle find the lowest common denominator
  //close to the 5% range of the width and/or height
  for (let i = width; i > 0; i--) {
    if(width % i === 0 && height % i === 0) {
      for (let j = 1; j <= 10; j++) {
        if ((i / j) <= (width * .05)) {
          return Math.floor(i / j);
        }
      }
    }
  }
}

let getAverageRGB = (tiles) => {
  //this function reduces the rgba values of a single tile into an object
  //then divides by the number of pixels in the tile to get the average
  //NOTE: additional information about this method can be found here:
  // https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Pixel_manipulation_with_canvas
  return tiles.map((tile, index) => {
    let { imgData: { data }, x, y } = tile;
    let rgb = { r: 0, g: 0, b: 0, pixels: 0 };
    for (let i = 0; i < data.length; i+=4) {
      rgb.r += data[i];
      rgb.g += data[i+1];
      rgb.b += data[i+2];
      rgb.pixels++;
    }
    let { r, g, b, pixels } = rgb;
    r = Math.floor(r/pixels);
    g = Math.floor(g/pixels);
    b = Math.floor(b/pixels);
    return { rgb: { r, g, b }, x, y };
  });
}

let getTileSVG = (hex) => {
  //this function returns an SVG from the /color/<hex> endpoint
  return new Promise((resolve, reject) => {
    let xhr = new XMLHttpRequest();
    xhr.open('GET', `/color/${hex}`);
    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(xhr.response);
      }
      else {
        reject(null);
      }
    };
    xhr.send();
  });
}

let renderTileRow = ({ mosaic, tiles, tilesInRow }, { index, count }) => {
  //this function writes a row of tiles to the DOM.
  //in order to make use of asynchrony, an array of promises are built first.
  //once all promises in that array are resolved, the row is appended.
  //NOTE: additonal information about Promise.all can be found here:
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all
  if (index === tiles.length) {
    return;
  }

  let arr = [];
  for (let i = 0; i < tilesInRow; i++) {
    arr.push(getTileSVG(tiles[index + i].hex));
  }

  Promise.all(arr).then((svgs) => {
    for(let i = 0; i < tilesInRow; i++) {
      let { x, y } = tiles[index + i];
      svgs[i] = `<div id="pill" class="svg-pill" data-coordinates="${x},${y}"><span class="no-hover">${svgs[i]}<span></div>`
    }
    let tileRow = svgs.join('');
    mosaic.innerHTML += `<div class="svg-row">${tileRow}</div>`;
    count++;
    index += tilesInRow;
    return renderTileRow({ mosaic, tiles, tilesInRow }, { index, count });
  });
}



//NOTE: While hovering over the mosaic.
//Adjusts the opacity on the uploaded image to show where the value comes from.
window.onload = () => {
  let mosaic = document.getElementById('mosaic');
  let canvas = document.getElementById('img-canvas');
  let context = canvas.getContext('2d');

  const addOpacity = debounce((e) => {

    let classname = e.target.className;
    let { width, height } = canvas;
    let tileDimension = getTileDimensions(width, height);
    let imgData = context.getImageData(0, 0, width, height);
    let { data } = imgData;

    for (let i = 0; i < data.length; i+=4) {
      imgData.data[i+3] = 255;
    }
    context.putImageData(imgData, 0, 0);

    if (classname === 'svg-pill') {
      const coordinates = e.target.getAttribute('data-coordinates').split(',');
      let x = parseInt(coordinates[0]), y = parseInt(coordinates[1]);
      const tilesInRow = Math.floor(width/tileDimension),
          tilesInColumn = Math.floor(height/tileDimension);
      let tileDimensionX, tileDimensionY;
      tileDimensionX = tileDimension;
      tileDimensionY = tileDimension;

      for (let i = 0; i < tilesInColumn; i++) {
        for (let j = 0; j < tilesInRow; j++) {
          let x = j*tileDimension, y = i*tileDimension;

          if (((tilesInRow - 1) === j) && ((width - x) !== tileDimension)) {
            tileDimensionX = (width - x);
          }
          if (((tilesInColumn - 1) === i) && ((height - y) !== tileDimension)) {
            tileDimensionY = (height - y);
          }
        }
      }

      let tile = context.getImageData(x, y, tileDimensionX, tileDimensionY);
      let { data } = tile;
      for (let i = 0; i < data.length; i+=4) {
        tile.data[i+3] = 127;
      }
      context.putImageData(tile, x, y);
    }
  }, 200);

  const redrawImage = debounce((e) => {
    let { width, height } = canvas;
    let imgData = context.getImageData(0, 0, width, height);
    let { data } = imgData;
    for (let i = 0; i < data.length; i+=4) {
      imgData.data[i+3] = 255;
    }
    context.putImageData(imgData, 0, 0);
  }, 100)

  mosaic.addEventListener('mouseover', addOpacity);
  mosaic.addEventListener('mouseleave', redrawImage);
};

//NOTE: debounce function used to prevent recalculating/redrawing the image with every mouse movement
// Additional information about debounce can be found here: https://davidwalsh.name/javascript-debounce-function
function debounce(func, wait, immediate) {
  var timeout;
	return function() {
		var context = this, args = arguments;
		var later = function() {
			timeout = null;
			if (!immediate) func.apply(context, args);
		};
		var callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) func.apply(context, args);
	};
};