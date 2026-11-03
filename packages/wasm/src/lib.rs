mod utils;

use wasm_bindgen::prelude::*;

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
        for row in 0..rows {
            let (y_start, y_end) = cell_bounds(row, rows, self.height);
            for col in 0..cols {
                let (x_start, x_end) = cell_bounds(col, cols, self.width);
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

// pixel range [start, end) of cell `i` when splitting `size` pixels into `cells`.
// multiplies before dividing so rounding never accumulates: the cells always
// cover the whole image even when size isn't divisible by cells. each cell is
// at least 1px, so with more cells than pixels neighbouring cells share a pixel.
fn cell_bounds(i: u32, cells: u32, size: u32) -> (u32, u32) {
    let start = ((i as u64 * size as u64) / cells as u64) as u32;
    let end = (((i + 1) as u64 * size as u64) / cells as u64) as u32;
    (start.min(size - 1), end.max(start + 1).min(size))
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

    #[test]
    fn test_cell_bounds_uneven_split() {
        // 10px into 4 cells is 2.5px each: cells alternate 2px and 3px and the
        // last one ends on the last pixel
        let cells: Vec<_> = (0..4).map(|i| cell_bounds(i, 4, 10)).collect();
        assert_eq!(cells, [(0, 2), (2, 5), (5, 7), (7, 10)]);
    }

    #[test]
    fn test_cell_bounds_more_cells_than_pixels() {
        // 2px into 4 cells: each pixel is shared by two cells, no cell is empty
        let cells: Vec<_> = (0..4).map(|i| cell_bounds(i, 4, 2)).collect();
        assert_eq!(cells, [(0, 1), (0, 1), (1, 2), (1, 2)]);
    }

    #[test]
    fn test_right_edge_is_rendered() {
        // 5×1 image: black, black, black, black, white
        let pixels = vec![
            0, 0, 0, 255, //
            0, 0, 0, 255, //
            0, 0, 0, 255, //
            0, 0, 0, 255, //
            255, 255, 255, 255, //
        ];
        let image = ImageData::new(&pixels, 5, 1);
        // 3 cols over 5px: [0], [1, 2], [3, 4]; the last cell is half white
        assert_eq!(image.pixels_to_ascii(3, 1), "  =\n");
    }

    #[test]
    fn test_bottom_edge_is_rendered() {
        // 1×5 image: black, black, black, black, white
        let pixels = vec![
            0, 0, 0, 255, //
            0, 0, 0, 255, //
            0, 0, 0, 255, //
            0, 0, 0, 255, //
            255, 255, 255, 255, //
        ];
        let image = ImageData::new(&pixels, 1, 5);
        // 3 rows over 5px: [0], [1, 2], [3, 4]; the last cell is half white
        assert_eq!(image.pixels_to_ascii(1, 3), " \n \n=\n");
    }

    #[test]
    fn test_more_cols_and_rows_than_pixels() {
        // 1×1 white image
        let pixels = vec![255, 255, 255, 255];
        let image = ImageData::new(&pixels, 1, 1);
        assert_eq!(image.pixels_to_ascii(3, 2), "@@@\n@@@\n");
    }
}
