import ObsWebSocket from 'obs-websocket-js';
import obsWebsocketJs from 'obs-websocket-js';

const autocropThreshold = 35;
const gdqGreen = [1, 128, 1];

const screenshotUrl = window.location.href;
const obsScreenshotURL = screenshotUrl.slice(8, -10) + 'screenshot.jpg';
let screenshotBase64 = '';
let connectedToOBS = false;
let obsConnectionError = '';
let cropItem: null | (sceneItemRef & crop & { width: number; height: number }) =
  null;
let cropSide: 'left' | 'right' | 'top' | 'bottom' | null = null;
let targetCrop: crop | null = null;
let initialCrop: crop | null = null;
let scale = 1;
let cropWidthSide: 'left' | 'right' | null = null;
let cropHeightSide: 'top' | 'bottom' | null = null;
let clickLoc = { clientX: 0, clientY: 0 };
let activelyCropping = false;
let currentSceneViewports: viewport[] = [];
let unassignedFeeds: viewport['assignedFeeds'] = [];
let currentSceneFeedScenes: string[] = [];
let videoFeeds: ObsWebSocket.SceneItem[] = [];
let selectedFeedsScene = '';
let pgm: string;
let pvw: string | null;
let subscribed = false;
let inInit = false;
const sourceIcons: {
  [key in obsSourceType]: string;
} = require('./source-icons.json');
let obsPort = 4444;
let obsPassword = '';
if (localStorage.getItem('obsPort'))
  obsPort = parseInt(localStorage.getItem('obsPort'));
if (localStorage.getItem('obsPassword'))
  obsPassword = localStorage.getItem('obsPassword');

//setup cropping controls
const cropDiv = document.getElementById('primary-crop') as HTMLDivElement;
const cropFrame = document.getElementById('crop-frame') as HTMLDivElement;
const cropImg = document.getElementById('crop-image') as HTMLImageElement;
const cropGuide = document.getElementById('crop-guide') as HTMLDivElement;
type SvgPathInHtml = HTMLElement & SVGPathElement;
const croppedSvg = document.getElementById('cropped') as SvgPathInHtml;
const cropOutline = document.getElementById('crop-outline') as HTMLDivElement;
document.onkeydown = (e) => {
  if (cropItem) {
    if (e.key == 'ArrowUp' && e.shiftKey == true && e.altKey == false) {
      stepChange('top', -1);
    }
    if (e.key == 'ArrowUp' && e.shiftKey == false && e.altKey == true) {
      stepChange('bottom', 1);
    }
    if (e.key == 'ArrowLeft' && e.shiftKey == true && e.altKey == false) {
      stepChange('left', -1);
    }
    if (e.key == 'ArrowLeft' && e.shiftKey == false && e.altKey == true) {
      stepChange('right', 1);
    }
    if (e.key == 'ArrowRight' && e.shiftKey == true && e.altKey == false) {
      stepChange('left', 1);
    }
    if (e.key == 'ArrowRight' && e.shiftKey == false && e.altKey == true) {
      stepChange('right', -1);
    }
    if (e.key == 'ArrowDown' && e.shiftKey == true && e.altKey == false) {
      stepChange('top', 1);
    }
    if (e.key == 'ArrowDown' && e.shiftKey == false && e.altKey == true) {
      stepChange('bottom', -1);
    }
		if (cropSide && e.shiftKey == false && e.altKey == false) {
			if (e.key == 'ArrowUp' && cropSide == 'top') {
				stepChange('top', -1)
			}
			if (e.key == 'ArrowUp' && cropSide == 'bottom') {
				stepChange('bottom', 1)
			}
			if (e.key == 'ArrowDown' && cropSide == 'top') {
				stepChange('top', 1)
			}
			if (e.key == 'ArrowDown' && cropSide == 'bottom') {
				stepChange('bottom', -1)
			}
			if (e.key == 'ArrowLeft' && cropSide == 'left') {
				stepChange('left', -1)
			}
			if (e.key == 'ArrowLeft' && cropSide == 'right') {
				stepChange('right', 1)
			}
			if (e.key == 'ArrowRight' && cropSide == 'left') {
				stepChange('left', 1)
			}
			if (e.key == 'ArrowRight' && cropSide == 'right') {
				stepChange('right', -1)
			}
		}
  }
};
function initZoomDirs() {
  document.querySelectorAll('.zoom').forEach((elem) => {
    const zoom = elem as HTMLImageElement;
    const side = zoom.parentElement.id.slice(0, -5) as
      | 'left'
      | 'right'
      | 'top'
      | 'bottom';
    if (cropSide == side) {
      zoom.src = 'assets/zoom_out.svg';
    } else zoom.src = 'assets/zoom_in.svg';
  });
}
document.querySelectorAll('.handle').forEach((elem) => {
  const handle = elem as HTMLElement;
  handle.onmousedown = (e) => {
    if (e.button == 0) {
      clickLoc = { clientX: e.clientX, clientY: e.clientY };
      cropWidthSide = null;
      if (handle.classList.contains('left')) cropWidthSide = 'left';
      if (handle.classList.contains('right')) cropWidthSide = 'right';
      cropHeightSide = null;
      if (handle.classList.contains('top')) cropHeightSide = 'top';
      if (handle.classList.contains('bottom')) cropHeightSide = 'bottom';
      initialCrop = {
        left: cropItem.left,
        right: cropItem.right,
        top: cropItem.top,
        bottom: cropItem.bottom,
      };
    }
  };
});
document.querySelectorAll('.zoom').forEach((elem) => {
  const zoom = elem as HTMLImageElement;
  const side = zoom.parentElement.id.slice(0, -5) as
    | 'left'
    | 'right'
    | 'top'
    | 'bottom';
  zoom.onclick = () => {
    if (cropSide != side) {
      cropSide = side;
      refreshCropImage();
    } else {
      cropSide = null;
      refreshCropImage();
    }
  };
});
document.querySelectorAll('.plus').forEach((elem) => {
  const plus = elem as HTMLElement;
  const side = plus.parentElement.id.slice(0, -5) as
    | 'left'
    | 'right'
    | 'top'
    | 'bottom';
  plus.onclick = () => {
    stepChange(side, 1);
  };
});
document.querySelectorAll('.minus').forEach((elem) => {
  const minus = elem as HTMLElement;
  const side = minus.parentElement.id.slice(0, -5) as
    | 'left'
    | 'right'
    | 'top'
    | 'bottom';
  minus.onclick = () => {
    stepChange(side, -1);
  };
});
function stepChange(side: 'left' | 'right' | 'top' | 'bottom', change: 1 | -1) {
  if (!cropItem) {
    obsError('step crop error');
  }
  let targetCrop = cropItem[side] + change;
  const sourceSize =
    side == 'left' || side == 'right' ? cropItem.width : cropItem.height;
  let oppositeCrop = 0;
  switch (side) {
    case 'left':
      oppositeCrop = cropItem.right;
      break;
    case 'right':
      oppositeCrop = cropItem.left;
      break;
    case 'top':
      oppositeCrop = cropItem.bottom;
      break;
    case 'bottom':
      oppositeCrop = cropItem.top;
      break;
  }
  if (targetCrop + oppositeCrop > sourceSize)
    targetCrop = sourceSize - oppositeCrop - 1;
  if (targetCrop < 0) targetCrop = 0;
  if (targetCrop != cropItem[side]) {
    const newCrop: crop = {
      left: Math.round(cropItem.left),
      right: Math.round(cropItem.right),
      top: Math.round(cropItem.top),
      bottom: Math.round(cropItem.bottom),
    };
    newCrop[side] = targetCrop;
    obs
      .send('SetSceneItemProperties', {
        'scene-name': cropItem['scene-name'],
        item: cropItem.item,
        crop: newCrop,
        position: {},
        scale: {},
        bounds: {},
      })
      .then(() => {
        cropItem[side] = targetCrop;
        refreshCropImage();
      })
      .catch(obsError);
  }
}
const controlsMove = (e: MouseEvent) => {
  if ((!cropWidthSide && !cropHeightSide) || !cropItem) return;
  let xDiff = 0;
  let yDiff = 0;
  targetCrop = {
    left: initialCrop.left,
    right: initialCrop.right,
    top: initialCrop.top,
    bottom: initialCrop.bottom,
  };
  if (cropWidthSide) {
    xDiff = Math.round((e.clientX - clickLoc.clientX) / scale);
    if (cropWidthSide == 'right') {
      targetCrop.right -= xDiff;
      if (targetCrop.right < 0) targetCrop.right = 0;
      if (targetCrop.right + targetCrop.left >= cropItem.width - 10)
        targetCrop.right = cropItem.width - targetCrop.left - 10;
    } else {
      targetCrop.left += xDiff;
      if (targetCrop.left < 0) targetCrop.left = 0;
      if (targetCrop.right + targetCrop.left >= cropItem.width - 10)
        targetCrop.left = cropItem.width - targetCrop.right - 10;
    }
  }
  if (cropHeightSide) {
    yDiff = Math.round((e.clientY - clickLoc.clientY) / scale);
    if (cropHeightSide == 'bottom') {
      targetCrop.bottom -= yDiff;
      if (targetCrop.bottom < 0) targetCrop.bottom = 0;
      if (targetCrop.bottom + targetCrop.top >= cropItem.height - 10)
        targetCrop.bottom = cropItem.height - targetCrop.top - 10;
    } else {
      targetCrop.top += yDiff;
      if (targetCrop.top < 0) targetCrop.top = 0;
      if (targetCrop.bottom + targetCrop.top >= cropItem.height - 10)
        targetCrop.top = cropItem.height - targetCrop.bottom - 10;
    }
  }
  cropItemToTarget();
};
const controlsStop = () => {
  cropWidthSide = null;
  cropHeightSide = null;
  initialCrop = null;
};
document.onmousemove = controlsMove;
document.onmouseup = controlsStop;
function cropItemToTarget(check?: 'check') {
  if (!cropItem || !targetCrop) {
    obsError("Can't crop without item and crop");
    activelyCropping = false;
    return;
  }
  if (activelyCropping && !check) return;
  activelyCropping = true;
  if (
    targetCrop.left != cropItem.left ||
    targetCrop.right != cropItem.right ||
    targetCrop.top != cropItem.top ||
    targetCrop.bottom != cropItem.bottom
  ) {
    obs
      .send('SetSceneItemProperties', {
        'scene-name': cropItem['scene-name'],
        item: cropItem.item,
        crop: targetCrop,
        position: {},
        scale: {},
        bounds: {},
      })
      .then(() => {
        cropItem.left = targetCrop.left;
        cropItem.right = targetCrop.right;
        cropItem.top = targetCrop.top;
        cropItem.bottom = targetCrop.bottom;
        refreshCropImage();
        setTimeout(() => {
          cropItemToTarget('check');
        }, 30);
      })
      .catch(obsError);
  } else activelyCropping = false;
}
document.getElementById('camera-crop').onclick = () => {
  cropViewportFeed('camera');
};
document.getElementById('game1-crop').onclick = () => {
  cropViewportFeed('game1');
};
document.getElementById('game2-crop').onclick = () => {
  cropViewportFeed('game2');
};

function obsError(err: any) {
  document.getElementById('footer').innerHTML = 'ERROR: ' + JSON.stringify(err);
  document.getElementById('footer').onclick = refreshFooter;
  console.error(err);
}
function hideWarning() {
  document.getElementById('warning').classList.add('hide');
}
function showWarning(msg: string) {
  document.getElementById('warning-msg').innerHTML = msg;
  document.getElementById('warning').classList.remove('hide');
}

const obs = new obsWebsocketJs();
function connectToOBS() {
  obsConnectionError = '';
  showWarning('Connecting dashboard to OBS');
  obs
    .connect({ address: 'localhost:' + obsPort, password: obsPassword })
    .then(() => {
      connectedToOBS = true;
      hideWarning();
      initOBS();
    })
    .catch((err) => {
      if (err?.error) err = err.error;
      obsConnectionError = err;
      showWarning('Connection error: ' + err);
      refreshFooter();
    });
}
connectToOBS();
refreshFooter();

obs.on('ConnectionClosed', () => {
  if (!obsConnectionError) showWarning('OBS connection closed.');
  connectedToOBS = false;
  refreshFooter();
});

const reInitEvents = [
  'SwitchScenes',
  'PreviewSceneChanged',
  'StudioModeSwitched',
  'SceneCollectionChanged',
  'SourceCreated',
  'SourceDestroyed',
  'SourceRenamed',
  'SceneItemAdded',
  'SceneItemRemoved',
  'SceneItemTransformChanged',
] as const;

function subscribeToChanges() {
  if (!subscribed)
    for (let i = 0; i < reInitEvents.length; i++) {
      obs.on(reInitEvents[i], initOBS);
    }
  subscribed = true;
}
function unsubscribeToChanges() {
  for (let i = 0; i < reInitEvents.length; i++) {
    obs.off(reInitEvents[i], initOBS);
  }
  subscribed = false;
}
subscribeToChanges();

obs.on('SceneItemVisibilityChanged', (data) => {
  const activeScene = pvw ? pvw : pgm;
  if (
    data['scene-name'] == activeScene &&
    currentSceneFeedScenes.indexOf(data['item-name']) != -1
  )
    if (subscribed) initOBS();
});

function initOBS() {
  if (!connectedToOBS) {
    obsError("Can't init, not connected");
    return;
  }
  if (cropItem) return;
  if (inInit) {
    obsError('initOBS called too frequently');
    return;
  }
  inInit = true;
  let sceneItems: ObsWebSocket.SceneItem[] = [];
  obs
    .send('GetPreviewScene')
    .then((data) => {
      pvw = data.name;
      sceneItems = data.sources;
    })
    .catch(() => {
      pvw = null;
    })
    .then(() => {
      return obs.send('GetSceneList');
    })
    .then((data) => {
      pgm = data['current-scene'];
      const currentScene =
        data.scenes[
          data.scenes.map((x) => x.name).indexOf(data['current-scene'])
        ];
      if (currentScene && !pvw) sceneItems = currentScene.sources;

      videoFeeds = [];
      const videoFeedsScene =
        data.scenes[data.scenes.map((x) => x.name).indexOf('Video Feeds')];
      if (videoFeedsScene) videoFeeds = videoFeedsScene.sources;
    })
    .then(() => {
      return updateFromCurrentSceneItems(sceneItems);
    })
    .then(() => {
      return populateViewportsFromActiveFeed();
    })
    .then(() => {
      refreshViewportsDiv();
    })
    .catch(obsError)
    .then(() => (inInit = false));
}

async function updateFromCurrentSceneItems(items: ObsWebSocket.SceneItem[]) {
  selectedFeedsScene = '';
  currentSceneFeedScenes = [];
  currentSceneViewports = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].name.slice(-10) == '_reference') {
      await obs
        .send('GetSceneItemProperties', {
          'scene-name': pvw ? pvw : pgm,
          item: { id: items[i].id },
        })
        .then((data) => {
          currentSceneViewports.push({
            name: data.name.slice(0, -10),
            x: data.position.x,
            y: data.position.y,
            width: data.width,
            height: data.height,
            assignedFeeds: [],
          });
        })
        .catch((err) => {
          obsError(err);
          currentSceneViewports = [];
          return;
        });
    }
    if (items[i].name.slice(0, 5) == 'Feeds') {
      currentSceneFeedScenes.push(items[i].name);
      if (items[i].render)
        if (!selectedFeedsScene) {
          selectedFeedsScene = items[i].name;
        } else {
          await obs.send('SetSceneItemProperties', {
            'scene-name': pvw ? pvw : pgm,
            item: { id: items[i].id },
            visible: false,
            position: {},
            scale: {},
            crop: {},
            bounds: {},
          });
        }
    }
  }
}

function populateViewportsFromActiveFeed() {
  unassignedFeeds = [];
  for (let i = 0; i < currentSceneViewports.length; i++)
    currentSceneViewports[i].assignedFeeds = [];
  if (!selectedFeedsScene) return;
  let sceneItemList: obsSceneItems = [];
  return obs
    .send('GetSceneItemList', { sceneName: selectedFeedsScene })
    .then(async (data) => {
      sceneItemList = data.sceneItems;
      for (let i = 0; i < data.sceneItems.length; i++) {
        await obs
          .send('GetSceneItemProperties', {
            'scene-name': selectedFeedsScene,
            item: { id: data.sceneItems[i].itemId },
          })
          .then((data) => {
            const viewportFeed: viewport['assignedFeeds'][number] = {
              'scene-name': selectedFeedsScene,
              item: { id: data.itemId, name: data.name },
              type: sceneItemList[i].sourceKind,
              left: data.crop.left,
              right: data.crop.right,
              top: data.crop.top,
              bottom: data.crop.bottom,
              width: data.sourceWidth,
              height: data.sourceHeight,
            };
            let assigned = false;
            for (let i = 0; i < currentSceneViewports.length; i++) {
              if (
                currentSceneViewports[i].x == data.position.x &&
                currentSceneViewports[i].y == data.position.y &&
                currentSceneViewports[i].width == data.bounds.x &&
                currentSceneViewports[i].height == data.bounds.y
              ) {
                currentSceneViewports[i].assignedFeeds.push(viewportFeed);
                assigned = true;
                break;
              }
            }
            if (!assigned) unassignedFeeds.push(viewportFeed);
          })
          .catch(obsError);
      }
    })
    .catch(obsError);
}

async function refreshViewportsDiv() {
  document.getElementById('viewports').classList.remove('hide');
  document.getElementById('crop').classList.add('hide');
  cropImg.src = '';
  const feedSelect = document.getElementById('feed-select');
  feedSelect.innerHTML = '';
  for (let i = 0; i < currentSceneFeedScenes.length; i++) {
    const feedBtn = document.createElement('div');
    feedBtn.classList.add('selection-item');
    if (currentSceneFeedScenes[i] == selectedFeedsScene)
      feedBtn.classList.add('selected');
    feedBtn.innerHTML = currentSceneFeedScenes[i];
    feedBtn.onclick = async () => {
      await selectFeed(currentSceneFeedScenes[i]);
      for (let i = 0; i < feedSelect.children.length; i++) {
        if (feedSelect.children[i].innerHTML == selectedFeedsScene) {
          feedSelect.children[i].classList.add('selected');
        } else feedSelect.children[i].classList.remove('selected');
      }
    };
    feedSelect.appendChild(feedBtn);
  }
  const listDiv = document.getElementById('viewports-list');
  listDiv.innerHTML = '';
  for (let i = 0; i <= currentSceneViewports.length; i++) {
    const headerDiv = document.createElement('div');
    headerDiv.classList.add('viewport-header');
    const titleDiv = document.createElement('div');
    titleDiv.classList.add('viewport-title');
    let viewportFeeds: typeof unassignedFeeds;
    if (i == currentSceneViewports.length) {
      if (unassignedFeeds.length == 0) break;
      titleDiv.innerHTML = 'Unassigned';
      headerDiv.appendChild(titleDiv);

      const removeSources = document.createElement('img');
      removeSources.classList.add('icon');
      removeSources.src = 'assets/trash.svg';
      removeSources.onclick = () => {
        if (confirm('Delete all unassigned video feeds?'))
          removeUnassignedSources();
      };
      headerDiv.appendChild(removeSources);

      viewportFeeds = unassignedFeeds;
    } else {
      titleDiv.innerHTML = currentSceneViewports[i].name;
      headerDiv.appendChild(titleDiv);
      const addSource = document.createElement('img');
      addSource.classList.add('icon');
      addSource.src = 'assets/plus.svg';
      const onClick = () => {
        addSource.onclick = () => {
          if (selectedFeedsScene) {
            addSource.onclick = null;
            addSourceOnclick(currentSceneViewports[i], headerDiv, onClick);
          } else obsError('No feed selected');
        };
      };
      onClick();
      headerDiv.appendChild(addSource);
      viewportFeeds = currentSceneViewports[i].assignedFeeds;
    }
    listDiv.appendChild(headerDiv);
    const viewportSourcesDiv = document.createElement('div');
    viewportSourcesDiv.classList.add('viewport-sources');
    for (let j = 0; j < viewportFeeds.length; j++) {
      const sourceDiv = document.createElement('div');
      sourceDiv.classList.add('source');
      const typeIcon = document.createElement('img');
      typeIcon.classList.add('icon');
      const type = viewportFeeds[j].type;
      if (
        sourceIcons.hasOwnProperty(type) &&
        sourceIcons[type as obsSourceType]
      ) {
        typeIcon.src = 'assets/sources/' + sourceIcons[type as obsSourceType];
      } else typeIcon.src = 'assets/sources/default.svg';
      sourceDiv.appendChild(typeIcon);
      const text = document.createElement('div');
      text.classList.add('source-text');
      text.innerHTML += viewportFeeds[j].item.name;
      sourceDiv.appendChild(text);
      const trashIcon = document.createElement('img');
      trashIcon.classList.add('icon');
      trashIcon.style.float = 'right';
      trashIcon.src = 'assets/trash.svg';
      trashIcon.onclick = () => {
        unsubscribeToChanges();
        obs
          .send('DeleteSceneItem', {
            scene: viewportFeeds[j]['scene-name'],
            item: viewportFeeds[j].item,
          })
          .then(() => {
            viewportFeeds.splice(j, 1);
          })
          .catch(obsError)
          .then(() => {
            subscribeToChanges();
            refreshViewportsDiv();
          });
      };
      sourceDiv.appendChild(trashIcon);
      const cropIcon = document.createElement('img');
      cropIcon.classList.add('icon');
      cropIcon.style.float = 'right';
      cropIcon.src = 'assets/crop.svg';
      cropIcon.onclick = () => {
        cropItem = viewportFeeds[j];
        refreshCropDiv();
      };
      sourceDiv.appendChild(cropIcon);
      viewportSourcesDiv.appendChild(sourceDiv);
    }
    listDiv.appendChild(viewportSourcesDiv);
  }
  refreshFooter();
}

async function removeUnassignedSources() {
  unsubscribeToChanges();
  for (let i = 0; i < unassignedFeeds.length; i++) {
    await obs
      .send('DeleteSceneItem', {
        scene: unassignedFeeds[i]['scene-name'],
        item: unassignedFeeds[i].item,
      })
      .catch(obsError);
  }
  unassignedFeeds = [];
  subscribeToChanges();
  refreshViewportsDiv();
}

function refreshCropDiv() {
  cropSide = null;
  if (!cropItem) {
    refreshViewportsDiv();
    return;
  }
  document.querySelectorAll('.base').forEach((elem) => {
    elem.classList.add('hide');
  });
  document.querySelectorAll('.crop-icon').forEach((elem) => {
    elem.classList.remove('hide');
  });
  obs
    .send('TakeSourceScreenshot', {
      sourceName: cropItem.item.name,
      saveToFilePath: obsScreenshotURL,
      embedPictureFormat: 'png',
    })
    .then((data) => {
      screenshotBase64 = data.img;
      const cropWindow = document.getElementById('crop');
      cropWindow.style.opacity = '0';
      cropWindow.classList.remove('hide');
      refreshCropImage();
      cropWindow.style.opacity = '1';
      document.getElementById('viewports').classList.add('hide');
    })
    .catch(obsError);
  refreshFooter();
}

function initCropDisplay() {
  cropImg.src = '';
  setSvgCropPath();
  cropFrame.style.opacity = '0';
  cropFrame.style.width = '';
  cropFrame.style.height = '';
  cropImg.style.transform = '';
  cropGuide.style.opacity = '0';
  cropOutline.style.opacity = '0';
  initZoomDirs();
}

function refreshCropImage() {
  initCropDisplay();
  const fullFrameX = cropDiv.clientWidth;
  const fullFrameY = cropDiv.clientHeight;
  if (cropSide) {
    const changeableCropItem = JSON.parse(
      JSON.stringify(cropItem)
    ) as typeof cropItem;
    cropGuide.className = cropSide;
    cropGuide.style.opacity = '1';
    let centerY = -1;
    let centerX = -1;
    let xSize = 10;
    let ySize = 10;
    if (cropSide == 'left' || cropSide == 'right') {
      ySize = Math.floor((2 * xSize * fullFrameY) / fullFrameX) / 2;
      const bottomY = cropItem.height - cropItem.bottom;
      centerY = Math.round((bottomY + cropItem.top) / 2);
      if (cropSide == 'right') {
        centerX = cropItem.width - cropItem.right;
      } else centerX = cropItem.left;
    } else {
      xSize = Math.floor((2 * ySize * fullFrameX) / fullFrameY) / 2;
      const rightX = cropItem.width - cropItem.right;
      centerX = Math.round((rightX + cropItem.left) / 2);
      if (cropSide == 'bottom') {
        centerY = cropItem.height - cropItem.bottom;
      } else centerY = cropItem.top;
    }
    changeableCropItem.left = centerX - xSize;
    changeableCropItem.right = cropItem.width - centerX - xSize;
    changeableCropItem.top = centerY - ySize;
    changeableCropItem.bottom = cropItem.height - centerY - ySize;
    const croppedSize = {
      x:
        changeableCropItem.width -
        (changeableCropItem.left + changeableCropItem.right),
      y:
        changeableCropItem.height -
        (changeableCropItem.top + changeableCropItem.bottom),
    };
    let shrinkAxis: 'width' | 'height' = 'width';
    let aspectRatio = croppedSize.x / croppedSize.y;
    if (fullFrameX / fullFrameY < aspectRatio) {
      shrinkAxis = 'height';
      aspectRatio = 1 / aspectRatio;
    }
    const [largeAxis, refSize, refAxis]: [
      'width' | 'height',
      number,
      'x' | 'y'
    ] =
      shrinkAxis == 'width'
        ? ['height', fullFrameY, 'y']
        : ['width', fullFrameX, 'x'];
    cropFrame.style[largeAxis] = refSize + 'px';
    cropFrame.style[shrinkAxis] = refSize * aspectRatio + 'px';
    scale = refSize / croppedSize[refAxis];
    const translateX =
      ((scale - 1) * changeableCropItem.width) / 2 -
      changeableCropItem.left * scale;
    const translateY =
      ((scale - 1) * changeableCropItem.height) / 2 -
      changeableCropItem.top * scale;
    cropImg.style.transform = `matrix(${scale}, 0, 0, ${scale}, ${translateX}, ${translateY})`;
    cropFrame.style.opacity = '1';
  } else {
    const aspectRatio = cropItem.width / cropItem.height;
    let width = fullFrameX;
    let height = fullFrameY;
    scale = fullFrameY / cropItem.height;
    if (fullFrameX / fullFrameY < aspectRatio) {
      height = width / aspectRatio;
      scale = fullFrameX / cropItem.width;
    } else width = aspectRatio * height;
    cropFrame.style.width = width.toString() + 'px';
    cropFrame.style.height = height.toString() + 'px';
    const translateX = ((scale - 1) * cropItem.width) / 2;
    const translateY = ((scale - 1) * cropItem.height) / 2;
    cropImg.style.transform = `matrix(${scale}, 0, 0, ${scale}, ${translateX}, ${translateY})`;
    setSvgCropPath(cropItem);
    cropOutline.style.width =
      (
        (cropItem.width - cropItem.left - cropItem.right) * scale +
        2
      ).toString() + 'px';
    cropOutline.style.height =
      (
        (cropItem.height - cropItem.top - cropItem.bottom) * scale +
        2
      ).toString() + 'px';
    cropOutline.style.left = (cropItem.left * scale - 1).toString() + 'px';
    cropOutline.style.top = (cropItem.top * scale - 1).toString() + 'px';
    cropOutline.style.transform = `translate(${translateX}, ${translateY})`;
    cropOutline.style.opacity = '1';
    cropFrame.style.opacity = '1';
  }
  cropImg.src = screenshotBase64;
}

async function selectFeed(feed: string) {
  selectedFeedsScene = feed;
  unsubscribeToChanges();
  for (let i = 0; i < currentSceneFeedScenes.length; i++) {
    let visible = false;
    if (currentSceneFeedScenes[i] == feed) visible = true;
    await obs.send('SetSceneItemProperties', {
      'scene-name': pvw ? pvw : pgm,
      item: { name: currentSceneFeedScenes[i] },
      visible: visible,
      crop: {},
      bounds: {},
      position: {},
      scale: {},
    });
  }
  subscribeToChanges();
}

function refreshFooter() {
  const footer = document.getElementById('footer');
  footer.innerHTML = '';
  footer.onclick = null;
  if (cropItem) {
    let icon = document.createElement('img');
    icon.width = 16;
    icon.classList.add('icon', 'footer');
    icon.src = 'assets/revert.svg';
    icon.onclick = () => {
      cropSide = null;
      if (!cropItem) {
        obsError('No cropItem');
        return;
      }
      obs
        .send('SetSceneItemProperties', {
          'scene-name': cropItem['scene-name'],
          item: cropItem.item,
          crop: { left: 0, right: 0, top: 0, bottom: 0 },
          position: {},
          scale: {},
          bounds: {},
        })
        .then(() => {
          cropItem.left = 0;
          cropItem.right = 0;
          cropItem.top = 0;
          cropItem.bottom = 0;
          refreshCropImage();
        })
        .catch(obsError);
    };
    footer.appendChild(icon);
    icon = document.createElement('img');
    icon.width = 16;
    icon.classList.add('icon', 'footer');
    icon.src = 'assets/check.svg';
    icon.onclick = () => {
      cropItem = null;
      cropSide = null;
      refreshViewportsDiv();
    };
    footer.appendChild(icon);
  } else {
    let icon = document.createElement('img');
    if (!connectedToOBS) {
      icon.width = 16;
      icon.classList.add('icon', 'footer');
      icon.src = 'assets/revert.svg';
      icon.onclick = () => {
        connectToOBS();
      };
      footer.appendChild(icon);
    }
    icon = document.createElement('img');
    icon.width = 16;
    icon.classList.add('icon', 'footer');
    icon.src = 'assets/general.svg';
    icon.onclick = () => {
      setTimeout(() => {
        if (document.querySelectorAll('.pop-up').length == 0) {
          const settingsBox = document.createElement('div');
          settingsBox.classList.add('pop-up');
          settingsBox.style.top = 'unset';
          settingsBox.style.bottom = '25px';
          settingsBox.style.zIndex = '9999';
          const portDiv = document.createElement('div');
          portDiv.className = 'setup-item';
          portDiv.innerHTML = 'Port: ';
          const port = document.createElement('input');
          port.style.float = 'right';
          port.value = obsPort.toString();
          port.oninput = () => {
            const maybe = parseInt(port.value);
            if (maybe.toString() == port.value) {
              obsPort = maybe;
            } else port.value = obsPort.toString();
          };
          portDiv.appendChild(port);
          settingsBox.appendChild(portDiv);
          const pwdDiv = document.createElement('div');
          pwdDiv.className = 'setup-item';
          pwdDiv.innerHTML = 'Password: ';
          const pwd = document.createElement('input');
          pwd.value = obsPassword;
          pwd.type = 'password';
          pwd.oninput = () => {
            obsPassword = pwd.value;
          };
          pwdDiv.appendChild(pwd);
          settingsBox.appendChild(pwdDiv);
          document.onclick = (e) => {
            if (
              e.target !== settingsBox &&
              !settingsBox.contains(e.target as Node)
            ) {
              document.onclick = null;
              localStorage.setItem('obsPort', obsPort.toString());
              localStorage.setItem('obsPassword', obsPassword);
              footer.removeChild(settingsBox);
            }
          };
          footer.appendChild(settingsBox);
        }
      }, 1);
    };
    footer.appendChild(icon);
  }
}

async function addSourceOnclick(
  viewport: viewport,
  headerDiv: HTMLDivElement,
  reset: () => void
) {
  await new Promise((res) => setTimeout(res, 1)); //allow click to propagate first;
  const addSourceDiv = document.createElement('div');
  addSourceDiv.classList.add('pop-up');
  for (let i = 0; i < videoFeeds.length; i++) {
    const sourceDiv = document.createElement('div');
    sourceDiv.classList.add('source');
    const icon = document.createElement('img');
    icon.classList.add('icon');
    const type = videoFeeds[i].type;
    if (
      sourceIcons.hasOwnProperty(type) &&
      sourceIcons[type as obsSourceType]
    ) {
      icon.src = 'assets/sources/' + sourceIcons[type as obsSourceType];
    } else icon.src = 'assets/sources/default.svg';
    sourceDiv.appendChild(icon);
    const text = document.createElement('div');
    text.classList.add('source-text');
    text.innerHTML += videoFeeds[i].name;
    sourceDiv.appendChild(text);
    sourceDiv.onclick = () => {
      document.onclick = null;
      headerDiv.removeChild(addSourceDiv);
      reset();
      addSourceToViewport(videoFeeds[i], viewport);
    };
    addSourceDiv.appendChild(sourceDiv);
  }
  document.onclick = (e) => {
    if (e.target !== addSourceDiv && !addSourceDiv.contains(e.target as Node)) {
      document.onclick = null;
      headerDiv.removeChild(addSourceDiv);
      reset();
    }
  };
  addSourceDiv.style.visibility = 'hidden';
  headerDiv.appendChild(addSourceDiv);
  const margin = 10;
  const moveUp =
    addSourceDiv.getBoundingClientRect().bottom + margin - window.innerHeight;
  if (moveUp > 0) addSourceDiv.style.transform = `translateY(-${moveUp}px)`;
  addSourceDiv.style.visibility = '';
}

async function addSourceToViewport(
  source: obsWebsocketJs.SceneItem,
  viewport: viewport
) {
  unsubscribeToChanges();
  const scene = selectedFeedsScene;
  let newItem: typeof unassignedFeeds[number];
  obs
    .send('AddSceneItem', { sceneName: scene, sourceName: source.name })
    .then((data) => {
      newItem = {
        'scene-name': selectedFeedsScene,
        type: source.type,
        item: { id: data.itemId, name: source.name },
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        width: source.source_cx,
        height: source.source_cy,
      };
      return obs.send('SetSceneItemProperties', {
        'scene-name': scene,
        item: newItem.item,
        position: { x: viewport.x, y: viewport.y },
        locked: true,
        scale: {},
        crop: {},
        bounds: {
          type: 'OBS_BOUNDS_SCALE_INNER',
          x: viewport.width,
          y: viewport.height,
        },
      });
    })
    .catch(obsError)
    .then(() => {
      subscribeToChanges();
      const viewportIndex = currentSceneViewports
        .map((x) => x.name)
        .indexOf(viewport.name);
      if (viewportIndex != -1 && newItem) {
        currentSceneViewports[viewportIndex].assignedFeeds.push(newItem);
        refreshViewportsDiv();
      } else initOBS();
    });
}

function cropViewportFeed(cropType: 'camera' | 'game1' | 'game2') {
  if (!cropItem) {
    obsError('No cropItem');
    return;
  }
  cropSide = null;
  const y1 = 0.124; //always game1 to webcam gap
  const y2 = 0.546; //game1 to game2 gap
  const x1 = 0.176; //webcam y/ game2 y
  const x2 = 0.718; //game1 y

  cropImg.style.transform = '';
  const width = cropItem.width;
  const height = cropItem.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(cropImg, 0, 0);
  const newItemRec = { left: -1, right: -1, top: -1, bottom: -1 };
  switch (cropType) {
    case 'game1':
      newItemRec.left = findGreenBlock(
        ctx,
        'x',
        x1 * width,
        x2 * width,
        y1 * height,
        true
      )[1];
      if (newItemRec.left == -1) newItemRec.left = 0;
      newItemRec.right = findGreenBlock(
        ctx,
        'x',
        x2 * width,
        width - 1,
        y1 * height,
        true
      )[0];
      if (newItemRec.right == -1) newItemRec.right = width - 1;
      newItemRec.bottom = findGreenBlock(
        ctx,
        'y',
        y1 * height,
        height - 1,
        x2 * width,
        true
      )[0];
      if (newItemRec.bottom == -1) newItemRec.bottom = height - 1;
      newItemRec.top = findGreenBlock(
        ctx,
        'y',
        0,
        y1 * height,
        x2 * width,
        true
      )[0];
      if (newItemRec.top == -1) newItemRec.top = 0;
      break;
    case 'game2':
      newItemRec.left = findGreenBlock(
        ctx,
        'x',
        0,
        x1 * width,
        y2 * height,
        true
      )[1];
      if (newItemRec.left == -1) newItemRec.left = 0;
      newItemRec.right = findGreenBlock(
        ctx,
        'x',
        x1 * width,
        x2 * width,
        y2 * height,
        true
      )[0];
      if (newItemRec.right == -1) newItemRec.right = width - 1;
      newItemRec.bottom = findGreenBlock(
        ctx,
        'y',
        y2 * height,
        height - 1,
        x1 * width,
        true
      )[0];
      if (newItemRec.bottom == -1) newItemRec.bottom = height - 1;
      newItemRec.top = findGreenBlock(
        ctx,
        'y',
        y1 * height,
        y2 * height,
        x1 * width,
        true
      )[0];
      if (newItemRec.top == -1) newItemRec.top = 0;
      break;
    case 'camera':
      newItemRec.left = findGreenBlock(
        ctx,
        'x',
        0,
        x1 * width,
        y1 * height,
        true
      )[1];
      if (newItemRec.left == -1) newItemRec.left = 0;
      newItemRec.right = findGreenBlock(
        ctx,
        'x',
        x1 * width,
        x2 * width,
        y1 * height,
        true
      )[0];
      if (newItemRec.right == -1) newItemRec.right = width - 1;
      newItemRec.bottom = findGreenBlock(
        ctx,
        'y',
        y1 * height,
        y2 * height,
        x1 * width,
        true
      )[0];
      if (newItemRec.bottom == -1) newItemRec.bottom = height - 1;
      newItemRec.top = findGreenBlock(
        ctx,
        'y',
        0,
        y1 * height,
        x2 * width,
        true
      )[0];
      if (newItemRec.top == -1) newItemRec.top = 0;
      break;
  }
  const newCrop = {
    left: newItemRec.left + 1,
    right: width - newItemRec.right,
    top: newItemRec.top + 1,
    bottom: height - newItemRec.bottom,
  };
  obs
    .send('SetSceneItemProperties', {
      'scene-name': cropItem['scene-name'],
      item: cropItem.item,
      crop: newCrop,
      position: {},
      scale: {},
      bounds: {},
    })
    .then(() => {
      cropItem.left = newCrop.left;
      cropItem.right = newCrop.right;
      cropItem.top = newCrop.top;
      cropItem.bottom = newCrop.bottom;
      refreshCropImage();
    })
    .catch(obsError);
}

function setSvgCropPath(crop?: typeof cropItem) {
  if (!crop) {
    croppedSvg.setAttribute('d', 'M0,0V1H1V0ZM0,0H1V1H0Z');
    return;
  }
  const left = crop.left / crop.width;
  const top = crop.top / crop.height;
  const right = 1 - crop.right / crop.width;
  const bottom = 1 - crop.bottom / crop.height;
  croppedSvg.setAttribute(
    'd',
    `M${left},${top}V${bottom}H${right}V${top}ZM0,0H1V1H0Z`
  );
}

//autocrop helpers:
function findGreenBlock(
  ctx: CanvasRenderingContext2D,
  axis: 'x' | 'y',
  start: number,
  end: number,
  otherAxis: number,
  allowend?: boolean
): [number, number] {
  let direction = 1;
  if (start > end) direction = -1;
  start = Math.round(start);
  end = Math.round(end);
  otherAxis = Math.round(otherAxis);
  let greenBlock: [number, number] = [-1, -1];
  let curBlock: [number, number] = [start - direction, start - direction];
  for (let i = start; (end - i) * direction >= 0; i += direction) {
    let coords: [number, number] = [i, otherAxis];
    if (axis == 'y') coords = [otherAxis, i];
    if (compareToGreen(ctx, ...coords) < autocropThreshold) {
      if (curBlock[1] == i - direction) {
        curBlock[1] = i;
      } else curBlock = [i, i];
    } else if (i - direction == curBlock[1]) {
      if (allowend || curBlock[0] != start - direction)
        if (
          Math.abs(curBlock[1] - curBlock[0]) >
          Math.abs(greenBlock[1] - greenBlock[0])
        ) {
          greenBlock = [...curBlock];
          if (greenBlock[0] == -1) greenBlock[0] = start;
        }
    }
  }
  if (
    allowend &&
    Math.abs(curBlock[1] - curBlock[0]) >
      Math.abs(greenBlock[1] - greenBlock[0])
  )
    greenBlock = [...curBlock];
  if (direction == -1) greenBlock = greenBlock.reverse() as [number, number];
  if (greenBlock[0] == start - direction || greenBlock[1] == start - direction)
    greenBlock = [-1, -1];
  return greenBlock;
}

function compareToGreen(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number
): number {
  const pixel = Array.from(ctx.getImageData(x, y, 1, 1).data);
  return (
    Math.abs(pixel[0] - gdqGreen[0]) +
    Math.abs(pixel[1] - gdqGreen[1]) +
    Math.abs(pixel[2] - gdqGreen[2])
  );
}
