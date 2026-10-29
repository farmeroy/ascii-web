mod utils;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
}

#[wasm_bindgen]
pub fn greet() {
    alert("Hello, rascii_web!");
}

struct ImageData<'a> {
    bits: &'a [u8],
    width: u32,
    height: u32,
}

impl<'a> ImageData<'a> {
    fn new(bits: &'a [u8], width: u32, height: u32) -> Self {
        Self {
            bits,
            width,
            height,
        }
    }
    fn get_pixel_at(&self, x: u32, y: u32) -> &[u8] {
        debug_assert!(x < self.width);
        debug_assert!(y < self.height);
        let start = (y * self.width + x) as usize * 4;
        return &self.bits[start..start + 4];
    }
    fn get_brightness_at(&self, x: u32, y: u32) -> f32 {
        let pixel = self.get_pixel_at(x, y);
        return 0.299 * pixel[0] as f32 + 0.587 * pixel[1] as f32 + 0.114 * pixel[2] as f32;
    }
    // return the full ascii image
    // cols and rows are used for sampling the average pixel values
    // to map onto the appropriate number of col/rows!
    fn pixels_to_ascii(&self, cols: u32, rows: u32) -> String {
        let mut output =
            String::with_capacity((self.width + 1) as usize * (self.height + 1) as usize);
        let xs = [' ', '.', ':', '-', '=', '+', '*', '#', '%', '@'];
        let cell_width = self.width / cols;
        let cell_height = self.height / rows;
        for row in 0..rows {
            for col in 0..cols {
                let x_start = col * cell_width;
                let x_end = (x_start + cell_width).min(self.width);
                let y_start = row * cell_height;
                let y_end = (y_start + cell_height).min(self.height);
                let mut cell_brightness_acc = 0.0;
                for y in y_start..y_end {
                    for x in x_start..x_end {
                        cell_brightness_acc += self.get_brightness_at(x, y);
                    }
                }
                let cell_area = (x_end - x_start) as f32 * (y_end - y_start) as f32;
                let cell_brightness: f32 = cell_brightness_acc / cell_area;
                output.push(xs[((xs.len() - 1) as f32 * (cell_brightness / 255.0)) as usize]);
            }
            output.push('\n');
        }
        return output;
    }
}

#[wasm_bindgen]
pub fn ascii_art(img_bytes: &[u8], width: u32, height: u32, cols: u32, rows: u32) -> String {
    let img = ImageData::new(img_bytes, width, height);
    return img.pixels_to_ascii(cols, rows);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_pixel() {
        // 2×2 image: red, green, blue, white
        let pixels = vec![
            255, 0, 0, 255, // (0,0) red
            0, 255, 0, 255, // (1,0) green
            0, 0, 255, 255, // (0,1) blue
            255, 255, 255, 255, // (1,1) white
        ];
        let img = ImageData::new(&pixels, 2, 2);

        assert_eq!(img.get_pixel_at(0, 0), &[255, 0, 0, 255]);
        assert_eq!(img.get_pixel_at(1, 0), &[0, 255, 0, 255]);
        assert_eq!(img.get_pixel_at(0, 1), &[0, 0, 255, 255]);
        assert_eq!(img.get_pixel_at(1, 1), &[255, 255, 255, 255]);
    }
    #[test]
    fn test_all_white_image() {
        let pixels = vec![255u8; 4 * 4 * 4]; // 4×4 pixels, 4 bytes each
        let image = ImageData::new(&pixels, 4, 4);
        let result = image.pixels_to_ascii(4, 4);
        assert!(result.contains('@'));
    }
}
