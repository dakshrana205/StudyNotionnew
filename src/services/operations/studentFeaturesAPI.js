import { toast } from "react-hot-toast";
import rzpLogo from "../../assets/Logo/rzp_logo.png";
import { resetCart } from "../../slices/cartSlice";
import { setPaymentLoading } from "../../slices/courseSlice";
import { setUser } from "../../slices/profileSlice";
import { apiConnector } from "../apiConnector";
import { endpoints, profileEndpoints, studentEndpoints } from "../apis";
import { getUserEnrolledCourses } from "./profileAPI";

const {
  COURSE_PAYMENT_API,
  COURSE_VERIFY_API,
  SEND_PAYMENT_SUCCESS_EMAIL_API,
} = studentEndpoints;

// Load the Razorpay SDK from the CDN
function loadScript(src) {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// Buy the Course
export async function BuyCourse(
  token,
  courses,
  user_details,
  navigate,
  dispatch
) {
  const toastId = toast.loading("Loading...");

  try {
    // Loading the script of Razorpay SDK
    const res = await loadScript("https://checkout.razorpay.com/v1/checkout.js");

    if (!res) {
      toast.error("Razorpay SDK failed to load. Check your Internet Connection.");
      return;
    }

    // Initiating the Order in Backend
    const orderResponse = await apiConnector(
      "POST",
      COURSE_PAYMENT_API,
      { courses },
      { Authorization: `Bearer ${token}` }
    );

    if (!orderResponse.data.success) {
      throw new Error(orderResponse.data.message);
    }

    console.log("PAYMENT RESPONSE FROM BACKEND............", orderResponse.data);

    // Amount in smallest unit (e.g., paise for INR)
    const amountInPaise = orderResponse.data.data.amount; // Assuming the backend sends the amount in the correct format.
    console.log("Razorpay Key:", process.env.REACT_APP_RAZORPAY_KEY);

    // Opening the Razorpay SDK
    const options = {
      key: process.env.REACT_APP_RAZORPAY_KEY, // Ensure the key is set in .env
      
      currency: orderResponse.data.data.currency,
      amount: amountInPaise, // Ensure the amount is in the smallest unit
      order_id: orderResponse.data.data.id,
      name: "CodePlay",
      description: "Thank you for Purchasing the Course.",
      image: rzpLogo,
      prefill: {
        name: `${user_details.firstName} ${user_details.lastName}`,
        email: user_details.email,
      },
      handler: async function (response) {
        try {
          console.log("Payment successful, sending success email...");
          await sendPaymentSuccessEmail(response, amountInPaise, token);
          console.log("Email sent, verifying payment...");
          await verifyPayment({ ...response, courses }, token, navigate, dispatch);
          console.log("Payment verification complete");
        } catch (error) {
          console.error("Error in payment handler:", error);
          toast.error("Error while handling payment: " + (error.message || "Unknown error"));
        }
      },
      modal: {
        ondismiss: function () {
          toast.error("Payment was dismissed.");
        },
      },
    };
    

    const paymentObject = new window.Razorpay(options);
    paymentObject.open();

    // Payment failed handler
    paymentObject.on("payment.failed", function (response) {
      toast.error("Oops! Payment Failed.");
      console.log(response.error);
    });
  } catch (error) {
    console.log("PAYMENT API ERROR............", error);
    toast.error("Could Not make Payment.");
  }

  toast.dismiss(toastId);
}

// Verify the Payment
export async function verifyPayment(bodyData, token, navigate, dispatch) {
  const toastId = toast.loading("Verifying Payment...");
  dispatch(setPaymentLoading(true));
  console.log("Starting payment verification with data:", bodyData);

  try {
    // Add a small delay to ensure the payment is processed
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (!bodyData || !token) {
      throw new Error("Invalid payment data or authentication token");
    }

    console.log("Sending payment verification request...", bodyData);
    const response = await apiConnector("POST", COURSE_VERIFY_API, bodyData, {
      Authorization: `Bearer ${token}`,
    });

    console.log("VERIFY PAYMENT RESPONSE:", response?.data);

    if (!response?.data?.success) {
      throw new Error(response?.data?.message || "Payment verification failed");
    }
    
    // If we have updated user data in the response, update the Redux store
    if (response?.data?.user) {
      console.log("Updating user data in Redux store with enrolled courses");
      
      // Ensure we have a proper user object with all required fields
      const userData = {
        ...response.data.user,
        image: response.data.user?.image || 
              `https://api.dicebear.com/5.x/initials/svg?seed=${response.data.user?.firstName || ''} ${response.data.user?.lastName || ''}`
      };
      
      // Make sure courses is an array
      if (!Array.isArray(userData.courses)) {
        userData.courses = [];
      }
      
      // Make sure courseProgress is an array
      if (!Array.isArray(userData.courseProgress)) {
        userData.courseProgress = [];
      }
      
      // Update the Redux store with the new user data
      dispatch(setUser(userData));
      
      // Also update localStorage to persist the data
      localStorage.setItem('user', JSON.stringify(userData));
    }
    
    // Show success message
    toast.success("Payment Successful! You've been enrolled in the course(s).");
    
    // Navigate to the enrolled courses page
    if (navigate && typeof navigate === 'function') {
      navigate("/dashboard/enrolled-courses");
      
      // Force a reload of the page to ensure all data is up to date
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
    
  } catch (error) {
    console.error("Error in verifyPayment:", error);
    toast.error(error?.message || "Payment verification failed. Please try again.");
    
    // If there's an error, still navigate to the enrolled courses page
    // to avoid the user being stuck on the payment page
    if (navigate && typeof navigate === 'function') {
      navigate("/dashboard/enrolled-courses");
    }
  } finally {
    toast.dismiss(toastId);
    dispatch(setPaymentLoading(false));
  }
}

// Send the Payment Success Email
async function sendPaymentSuccessEmail(response, amount, token) {
  try {
    await apiConnector(
      "POST",
      SEND_PAYMENT_SUCCESS_EMAIL_API,
      {
        orderId: response.razorpay_order_id,
        paymentId: response.razorpay_payment_id,
        amount,
      },
      { Authorization: `Bearer ${token}` }
    );
  } catch (error) {
    console.log("PAYMENT SUCCESS EMAIL ERROR............", error);
  }
}
