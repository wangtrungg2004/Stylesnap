import React from 'react';
import { logEvent } from '../lib/ga';


// Quét tất cả ảnh trong 2 thư mục (build-time)
const frontLogoFiles = import.meta.glob(
  '/src/assets/logos/**/*.{png,jpg,jpeg,svg,webp,gif}',
  { eager: true, as: 'url' }
);
const backLogoFiles = import.meta.glob(
  '/src/assets/logos/**/*.{png,jpg,jpeg,svg,webp,gif}',
  { eager: true, as: 'url' }
);

// Helper: lấy tên hiển thị từ tên file
const fileToName = (p) =>
  p.split('/').pop()?.replace(/\.(png|jpe?g|svg|webp|gif)$/i, '')?.replace(/[-_]+/g, ' ') || 'logo';

const builtInFrontLogos = Object.entries(frontLogoFiles).map(([path, url]) => ({
  type: 'frontLogo',
  name: fileToName(path),
  image: url,
}));

const builtInBackLogos = Object.entries(backLogoFiles).map(([path, url]) => ({
  type: 'backLogo',
  name: fileToName(path),
  image: url,
}));

const TextureLogoPicker = ({ texturesLogos = [], handleTextureLogoClick }) => {
  // Nhóm từ props (nếu bạn vẫn truyền thêm bằng code cũ)
  const texturesFromProps  = texturesLogos.filter((it) => it.type === 'texture');
  const frontFromProps     = texturesLogos.filter((it) => it.type === 'frontLogo');
  const backFromProps      = texturesLogos.filter((it) => it.type === 'backLogo');

  // Gộp: logo có sẵn (quét thư mục) + logo truyền qua props
  const textures  = [...texturesFromProps]; // giữ nguyên hoạ tiết cũ nếu có
  const frontLogos = [...builtInFrontLogos, ...frontFromProps];
  const backLogos  = [...builtInBackLogos,  ...backFromProps];

  const mapKind = (type) => {
    if (type === 'texture')   return 'full';
    if (type === 'frontLogo') return 'front_logo';
    if (type === 'backLogo')  return 'back_logo';
    return 'unknown';
  };

  const onPick = (image) => {
    try {
      logEvent('apply_texture', {
        kind: mapKind(image?.type),
        name: image?.name || undefined,
      });
    } catch {}
    handleTextureLogoClick?.(image);
  };

  const renderImages = (images) => (
    <div className="grid grid-cols-2 gap-2">
      {images.map((image, idx) => {
        const safeKey = `${image.type || 'item'}::${image.name || image.image || idx}`;
        return (
          <button
            type="button"
            key={safeKey}
            onClick={() => onPick(image)}
            className="rounded-full overflow-hidden focus:outline-none ring-1 ring-black/10 hover:ring-black/20"
            title={image.name}
            aria-label={image.name || 'texture'}
          >
            <img src={image.image} alt={image.name} className="w-full h-auto" />
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="absolute left-full ml-3 space-y-2">
      {/* Nếu bạn muốn vẫn có mục Hoạ tiết từ props */}
      {textures.length > 0 && (
        <div>
          <h2 className="font-medium mb-1">Hoạ tiết</h2>
          <div className="flex flex-wrap overflow-y-scroll w-40 h-40">
            {renderImages(textures)}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-medium mb-1">Logo trước</h2>
        <div className="flex flex-wrap overflow-y-scroll w-40 h-40">
          {renderImages(frontLogos)}
        </div>
      </div>

      <div>
        <h2 className="font-medium mb-1">Logo sau</h2>
        <div className="flex flex-wrap overflow-y-scroll w-40 h-40">
          {renderImages(backLogos)}
        </div>
      </div>
    </div>
  );
};

export default TextureLogoPicker;
