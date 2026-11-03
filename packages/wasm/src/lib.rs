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
    fn test_cell_bounds_cover_whole_size() {
        for size in 1..=64 {
            for cells in 1..=128 {
                let bounds: Vec<(u32, u32)> =
                    (0..cells).map(|i| cell_bounds(i, cells, size)).collect();
                let ctx = format!("size {} cells {}: {:?}", size, cells, bounds);

                assert_eq!(bounds[0].0, 0, "first cell doesn't start at 0, {}", ctx);
                assert_eq!(bounds[bounds.len() - 1].1, size, "last cell doesn't reach the end, {}", ctx);
                for &(start, end) in &bounds {
                    assert!(start < end && end <= size, "empty or out of range cell, {}", ctx);
                }
                for pair in bounds.windows(2) {
                    let (prev, next) = (pair[0], pair[1]);
                    assert!(next.0 <= prev.1, "gap between cells, {}", ctx);
                    if cells <= size {
                        assert_eq!(next.0, prev.1, "cells overlap, {}", ctx);
                    }
                }
            }
        }
    }

    // Black image with a white right column and bottom row: the output's last
    // column and last row must pick them up.
    fn edge_image(width: u32, height: u32) -> Vec<u8> {
        let mut pixels = vec![0u8; (width * height * 4) as usize];
        for y in 0..height {
            for x in 0..width {
                if x == width - 1 || y == height - 1 {
                    let i = ((y * width + x) * 4) as usize;
                    pixels[i..i + 3].copy_from_slice(&[255, 255, 255]);
                }
            }
        }
        pixels
    }

    #[test]
    fn test_output_reaches_image_edges() {
        // odd sizes so most cols/rows don't divide evenly
        let (width, height) = (37, 23);
        let pixels = edge_image(width, height);
        let image = ImageData::new(&pixels, width, height);

        // from half the pixel count up, edge cells are at most 2px so the
        // white edge is bright enough to never average out to ' '
        let sizes = (width / 2..=width * 2).flat_map(|c| (height / 2..=height * 2).map(move |r| (c, r)));
        for (cols, rows) in sizes {
            let result = image.pixels_to_ascii(cols, rows);
            let lines: Vec<&str> = result.lines().collect();
            assert_eq!(lines.len(), rows as usize);
            for (i, line) in lines.iter().enumerate() {
                assert_eq!(line.chars().count(), cols as usize);
                assert_ne!(
                    line.chars().last(),
                    Some(' '),
                    "{}x{}: row {} misses the image's right edge",
                    cols,
                    rows,
                    i
                );
            }
            assert!(
                lines.last().unwrap().chars().all(|c| c != ' '),
                "{}x{}: last row misses the image's bottom edge",
                cols,
                rows
            );
        }
    }

    #[test]
    fn test_white_image_is_all_bright_at_any_size() {
        let pixels = vec![255u8; 4 * 4 * 4];
        let image = ImageData::new(&pixels, 4, 4);
        for cols in 1..=12 {
            for rows in 1..=12 {
                let result = image.pixels_to_ascii(cols, rows);
                assert!(
                    result.lines().all(|l| l.chars().all(|c| c == '@')),
                    "{}x{}:\n{}",
                    cols,
                    rows,
                    result
                );
            }
        }
    }
}
