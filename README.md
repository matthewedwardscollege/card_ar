# CardAR

## About CardAR

  I (Matthew Edwards) created this GitHub repository to demonstrate the program I described in my Common Application essay. This is the same program that I described in the essay. I thought that it would make sense to provide evidence that this is a real project that I actually created. The source code of this project references an open source JavaScript library called Tesseract.js https://tesseract.projectnaptha.com/. Tesseract.js is the optical character recognition library that CardAR uses to read the text from images in order to determine which image to superimpose onto the card. All of the files in the directory card_ar/card_ar_6/img/ are image and video files which I downloaded from Google. While Tesseract.js can read text from an image, it does not have the ability to detect cards or determine the rotation of cards. The orientation and position of cards is determined by code written by me. Apart from the files in the directory card_ar/card_ar_6/img/ and Tesseract.js, all other files in this repository are either code that was written by me or screenshots of the program running that were produced by me.

## Try out CardAR for yourself:

By clicking on the following link you will be able to run CardAR for yourself in your browser. (Please note that brighter lighting conditions generally yield better results.)

https://matthewedwardscollege.github.io/card_ar/card_ar_6/

## Additional notes about the source code:

  - card_ar/card_ar_6/card_ar/workers/imports/lumes.js is a library I originally created for an image editing program and repurposed for card_ar, despite that it has functionality which is not utilized in this program, it is my work, and it is not a library that can be found elsewhere on the web. While it has the capability to produce many different effects, it is used in this program, because it includes the ability to do kernel convolutions on images which was useful, because this program relies on Sobel edge detection.

  - In order to use the run program, card_ar/card_ar_6/index.html should be opened in the browser as the starting HTML page, and the user should have a working front-facing webcam with camera permissions enabled in their browser.

## Explanation of how the algorithm works:
  
  CardAR uses an algorithm I created that I call SFFA, (short for Sobel flood fill algorithm). SFFA uses a combination of the Sobel edge detection and flood fill algorithms to output a list of bounding boxes of objects in a given input image. SFFA first takes the input image and converts it to grayscale, then with this grayscale image, it then convolves a Sobel edge detection kernel over the grayscale image. The result is an approximation of the derivative of the original input image. The rate of change of the shade of pixels in a given image corresponds to the edges of objects within that image. Next, the Sobel edge detection output is thresholded, so that instead of a Uint8ClampedArray with values ranging between 0 and 255, there is a boolean array with values either true (representing a pixel that is the corner of an object) or false (representing a pixel that is not the corner of an object). If I were to re-create this algorithm, I would compute the edge detection image on the main thread using WebGL instead of doing it on the CPU in a worker thread. However, since I set this task to run in parallel to the main thread on a worker thread, it does not seem to negatively impact the performance of CardAR in a noticeable way. Next, SFFA scans over each pixel of the boolean array, any time SFFA encounters a pixel that is false, SFFA will run an iterative flood fill algorithm starting at that pixel filling in any false values with true. For each time the flood fill algorithm is called, the smallest and largest x and y values of the explored pixels will be recorded as minX, minY, maxX, and maxY, from which a rectangle array [x, y, width, height] (where x = minX, y = minY, width = maxX - minX, and height = maxY - minY) can be inserted into a list of the bounding boxes of all objects in the current video frame. I wish it were possible to speed up flood fill using the GPU, but a limitation of the flood fill algorithm is that it is not very practical or advantageous performance-wise to do this, so if I were to re-create this program now, I would still run flood fill in a worker thread.

  After the SFFA algorithm has returned a list of of potential bounding boxes, each bounding box then goes through an algorithm that uses a combination of the area of each box as well as the Euclidean distance of the average RGB color to the color white ([255, 255, 255]), and uses this information to find which object is most likely the card being held up to the camera. The card is assumed to be the largest/closest object to the camera. However, one issue is that most rooms have white walls. To counter this, the algorithm will filter out any boxes that are touching the edges of the video frame. A consequence of the algorithm factoring in the closeness of the average color of each card to the color white is that the more bright and over-exposed the input image is, the more accurately CardAR can find a card in a given image. Additionally, if there is either a visible thick dark outline to the card, or the card is presented over a high-contrast background, it will be much easier for the edge detection algorithm to close in any gaps in the edges of the card. SFFA also preserves the start position of the flood fill algorithm that found each object.
  
  Once the list of bounding boxes has been filtered out and the bounding box of the card has been found, another algorithm I created I call rect rotation uses the output data from SFFA to determine the orientation of the card. Rect rotation re-runs the flood fill algorithm over the card again, only this time, instead of finding the maximum and minimum coordinates of the explored pixels, it records the most northern, southern, eastern, and western coordinates that are explored in the flood fill. It then will attempt to approximate the 2D orientation of the card using a combination of Bretschneider's formula (which uses the area of the quadrilateral to estimate whether the card is perfectly aligned vertically and horizontally, in which case the most northern, southern, eastern, and western points on the card will not actually align with the real corners of the card, in which case it will revert to the original bounding box) and the native JavaScript Math.atan2 function (which determines the angle of rotation of the card).
  
  When I originally created CardAR, I did not know how to render a 2D image with 3D perspective, but I were to re-create this program again, having since taken Linear Algebra, I would attempt to use a homographic transform matrix to get a more realistic result with a more exact match between the position of the card and the overlay image. I would have to use WebGL in order to render a 3D homeographic transform matrix because according to https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/transform a CanvasRenderingContext2D context only natively supports 2D perspective. However, CSS does support 3D transform matricies https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function/matrix3d (the link also says, "This [cartesian coordinates on R^3 / homogeneous coordinates on RP^3] transformation applies to the 3D space and can't be represented on the plane."). Additionally, I believe that I could use the inverse homographic transform matrix to improve OCR accuracy by removing the 3D perspective from the OCR input by flattening it to look 2D. I would also write my own WebGL brightness filter if I were to re-do this project, because the native JavaScript brightness filter implementation simply multiplies the sRGB values of a given image by a brightness value, however, since sRGB is a non-linear color space, if gamma is not accounted for, data will be lost much faster through over-exposure than it would be if the sRGB color values were first converted to the linear lRGB color space, multiplied, then converted back again. This would allow for a much greater range of lighting conditions.
  
  Once the orientation of the card is determined, finally, CardAR it re-orients the image of the card, adjust the contrast, and inputs the cropped text to an open-source optical character recognition (OCR) library I found online called Tesseract.js that reads the text written on the card, which the program then uses to determine which image to superimpose onto the video output. One problem I encountered was that the OCR wasn’t very reliable on human handwriting since it was optimized for print, so I had to come up with my own text similarity algorithm (for example, the typo “caa” is closer to “cat” than “dog”). The final change I would make to this program if I were to re-create it, is that I would swap out my own text similarity algorithm for the Wagner-Fischer algorithm, which is more precise, and more computationally efficient. However, for this project, the non-standard text similarity algorithm I came up with seems to be good enough to correct the OCR output most of the time pretty accurately.

## The following is a list of valid text which can be read by CardAR to display images:

  (Please note that because Tesseract.js is optimized for typeface and not human handwriting, large bold capital letters are much easier for the program to detect. Additionally, drawing a border around the edges of the card helps the program to more accurately determine the bounds of the card.)

  - STARRY NIGHT

  - MONA LISA

  - CAT

  - DOG
  
  - OCEANS

"STARRY NIGHT," "MONA LISA," "CAT," and "DOG" all display still images while, "OCEANS" displays a video.

## Screenshots of CardAR:

Example of what a card should look like:

<p align="center">
<img style="width: 60%;" src="https://github.com/matthewedwardscollege/card_ar/blob/main/card_ar_screenshots/raw_feed.png">
</p>

Example of the output of CardAR after it recognizes a card:

<p align="center">
<img style="width: 60%;" src="https://github.com/matthewedwardscollege/card_ar/blob/main/card_ar_screenshots/superimposed.png">
</p>

Example of how SFFA (Sobel Flood Fill Algorithm) detects objects in an image:

<p align="center">
<img style="width: 60%;" src="https://github.com/matthewedwardscollege/card_ar/blob/main/card_ar_screenshots/superimposed_with_bounds.png">
</p>
