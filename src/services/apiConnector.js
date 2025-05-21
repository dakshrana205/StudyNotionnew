import axios from "axios";

// Create a basic axios instance without baseURL
const axiosInstance = axios.create();

export const apiConnector = (method, url, bodyData, headers, params) => {
  return axiosInstance({
    method: `${method}`,
    url: `${url}`, // The `url` should be the complete URL
    data: bodyData ? bodyData : null,
    headers: headers ? headers : null,
    params: params ? params : null,
    withCredentials: true, // Important for sending cookies with CORS
  });
};
