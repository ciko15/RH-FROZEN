import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const sourceImgPath = path.resolve('WhatsApp Image 2026-10-13 at 18.50.29 (1).jpeg');
const iconsDir = path.resolve('web/public/icons');
const publicDir = path.resolve('web/public');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

async function generateIcons() {
  console.log('Generating PWA icons from logo:', sourceImgPath);

  if (!fs.existsSync(sourceImgPath)) {
    console.error('Source logo file not found:', sourceImgPath);
    process.exit(1);
  }

  // 192x192
  await sharp(sourceImgPath)
    .resize(192, 192, { fit: 'cover' })
    .png()
    .toFile(path.join(iconsDir, 'icon-192x192.png'));
  console.log('✓ Generated icon-192x192.png');

  // 512x512
  await sharp(sourceImgPath)
    .resize(512, 512, { fit: 'cover' })
    .png()
    .toFile(path.join(iconsDir, 'icon-512x512.png'));
  console.log('✓ Generated icon-512x512.png');

  // 512x512 maskable (with 10% padding for safe zone)
  const innerSize = Math.round(512 * 0.8);
  const innerBuffer = await sharp(sourceImgPath)
    .resize(innerSize, innerSize, { fit: 'cover' })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: '#1d4ed8'
    }
  })
    .composite([{ input: innerBuffer, gravity: 'center' }])
    .png()
    .toFile(path.join(iconsDir, 'icon-512x512-maskable.png'));
  console.log('✓ Generated icon-512x512-maskable.png');

  // apple-touch-icon 180x180
  await sharp(sourceImgPath)
    .resize(180, 180, { fit: 'cover' })
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('✓ Generated apple-touch-icon.png');

  // favicon 32x32
  await sharp(sourceImgPath)
    .resize(32, 32, { fit: 'cover' })
    .png()
    .toFile(path.join(publicDir, 'favicon.ico'));
  console.log('✓ Generated favicon.ico');

  // Copy logo as logo.png in public for UI branding
  await sharp(sourceImgPath)
    .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(path.join(publicDir, 'logo.png'));
  console.log('✓ Generated logo.png in web/public');

  console.log('Semua ikon PWA berhasil dibuat!');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
