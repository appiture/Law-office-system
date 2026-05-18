/**
 * apiResponse.js
 * 
 * Standardized response structures for API calls and utility functions.
 */

export const successResponse = (data, message = "Operation successful") => ({
  success: true,
  data,
  message
});

export const errorResponse = (message = "An error occurred", data = null) => ({
  success: false,
  message,
  data
});
