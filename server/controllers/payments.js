const { instance } = require("../config/razorpay")
const Course = require("../models/Course")
const crypto = require("crypto")
const User = require("../models/User")
const mailSender = require("../utils/mailSender")
const mongoose = require("mongoose")
const {
  courseEnrollmentEmail,
} = require("../mail/templates/courseEnrollmentEmail")
const { paymentSuccessEmail } = require("../mail/templates/paymentSuccessEmail")
const CourseProgress = require("../models/CourseProgress")

// Capture the payment and initiate the Razorpay order
exports.capturePayment = async (req, res) => {
  const { courses } = req.body
  const userId = req.user.id
  
if (!Array.isArray(courses) || courses.length === 0) {
  return res.json({ success: false, message: "Please Provide Course ID" });
}

  let total_amount = 0

  for (const course_id of courses) {
    let course
    try {
      // Find the course by its ID
      course = await Course.findById(course_id)

      // If the course is not found, return an error
      if (!course) {
        return res
          .status(200)
          .json({ success: false, message: "Could not find the Course" })
      }

      // Check if the user is already enrolled in the course
      const uid = new mongoose.Types.ObjectId(userId)
      if (course.studentsEnroled.includes(uid)) {
        return res
          .status(200)
          .json({ success: false, message: "Student is already Enrolled" })
      }

      // Add the price of the course to the total amount
      total_amount += course.price
    } catch (error) {
      console.log(error)
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  const options = {
    amount: total_amount * 100,
    currency: "INR",
    receipt: Math.random(Date.now()).toString(),
  }

  try {
    // Initiate the payment using Razorpay
    const paymentResponse = await instance.orders.create(options)
    console.log(paymentResponse)
    res.json({
      success: true,
      data: paymentResponse,
    })
  } catch (error) {
    console.log(error)
    res
      .status(500)
      .json({ success: false, message: "Could not initiate order." })
  }
}

// verify the payment
exports.verifyPayment = async (req, res) => {
  console.log("Verifying payment...");
  const razorpay_order_id = req.body?.razorpay_order_id;
  const razorpay_payment_id = req.body?.razorpay_payment_id;
  const razorpay_signature = req.body?.razorpay_signature;
  const courses = req.body?.courses;
  const userId = req.user.id;

  console.log("Payment verification request received:", {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature: razorpay_signature ? 'present' : 'missing',
    courses,
    userId
  });

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !courses || !userId) {
    console.error("Payment verification failed: Missing required fields");
    return res.status(200).json({ 
      success: false, 
      message: "Payment Failed: Missing required fields" 
    });
  }

  let body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET)
    .update(body.toString())
    .digest("hex");

  console.log("Verifying signature...");
  console.log("Expected signature:", expectedSignature);
  console.log("Received signature:", razorpay_signature);

  if (expectedSignature === razorpay_signature) {
    console.log("Signature verified. Enrolling student in courses...");
    const session = await mongoose.startSession();
    
    try {
      console.log("Starting transaction for enrollment...");
      await session.startTransaction();
      
      try {
        // Enroll the student in the courses
        console.log("Calling enrollStudents with courses:", courses, "and userId:", userId);
        const enrollmentResult = await enrollStudents(courses, userId, session);
        console.log("Enrollment completed successfully.", enrollmentResult);
        
        if (!enrollmentResult.success) {
          throw new Error("Failed to enroll student in courses");
        }
        
        // Get the fully updated user data with populated courses and course details
        const updatedUser = await User.findById(userId)
          .populate({
            path: 'courses',
            populate: {
              path: 'courseContent',
              populate: {
                path: 'subSection'
              }
            }
          })
          .populate({
            path: 'courseProgress',
            populate: {
              path: 'courseID',
              select: 'courseName'
            }
          })
          .lean()
          .session(session)
          .exec();
        
        // Commit the transaction
        console.log("Committing transaction...");
        await session.commitTransaction();
        console.log("Transaction committed successfully");
        
        console.log("Sending success response with user data");
        
        // Send the response with the updated user data
        return res.status(200).json({
          success: true,
          message: "Payment verified and course enrollment successful",
          user: updatedUser,
          courses: updatedUser.courses,
          courseProgress: updatedUser.courseProgress
        });
      } catch (enrollError) {
        console.error("Error during enrollment:", enrollError);
        await session.abortTransaction();
        throw enrollError;
      }
    } catch (error) {
      console.error("Error during enrollment:", error);
      
      // If there's an error, abort the transaction
      if (session?.inTransaction) {
        try {
          console.log("Aborting transaction due to error...");
          await session.abortTransaction();
          console.log("Transaction aborted");
        } catch (abortError) {
          console.error("Error aborting transaction:", abortError);
        }
      }
      
      // End the session
      try {
        if (session) {
          await session.endSession();
          console.log("Session ended after error");
        }
      } catch (endSessionError) {
        console.error("Error ending session:", endSessionError);
      }
      
      return res.status(500).json({ 
        success: false, 
        message: "Payment verification succeeded but enrollment failed",
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } finally {
      // Ensure the session is always ended
      try {
        if (session) {
          await session.endSession();
          console.log("Session ended in finally block");
        }
      } catch (endSessionError) {
        console.error("Error ending session in finally block:", endSessionError);
      }
    }
  } else {
    console.error("Payment verification failed: Invalid signature");
    return res.status(200).json({ 
      success: false, 
      message: "Payment Failed: Invalid signature" 
    });
  }
};

// Send Payment Success Email
exports.sendPaymentSuccessEmail = async (req, res) => {
  const { orderId, paymentId, amount } = req.body;
  const userId = req.user.id;

  if (!orderId || !paymentId || !amount || !userId) {
    return res
      .status(400)
      .json({ success: false, message: "Please provide all the details" });
  }

  try {
    const enrolledStudent = await User.findById(userId);
    if (!enrolledStudent) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await mailSender(
      enrolledStudent.email,
      `Payment Received`,
      paymentSuccessEmail(
        `${enrolledStudent.firstName} ${enrolledStudent.lastName}`,
        amount / 100,
        orderId,
        paymentId
      )
    );
    
    return res.status(200).json({
      success: true,
      message: "Payment success email sent successfully"
    });
  } catch (error) {
    console.error("Error in sending payment success email:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send payment success email",
      error: error.message
    });
  }
};

// enroll the student in the courses
const enrollStudents = async (courses, userId, session) => {
  console.log("Starting enrollment process...");
  console.log("Courses to enroll in:", courses);
  console.log("User ID:", userId);

  if (!courses || !userId) {
    const errorMsg = "Please provide both courses and user ID";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Convert single course ID to array if it's not already an array
  const coursesArray = Array.isArray(courses) ? courses : [courses];
  console.log("Processing enrollment for courses:", coursesArray);

  // Validate user ID
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    console.error("Invalid user ID:", userId);
    throw new Error("Invalid user ID");
  }

  let shouldEndSession = false;
  if (!session) {
    console.log("Creating new session for enrollment");
    session = await mongoose.startSession();
    await session.startTransaction();
    shouldEndSession = true;
    console.log("New session and transaction started");
  } else {
    console.log("Using existing session for enrollment");
  }

  try {
    // Verify user exists
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    for (const courseId of coursesArray) {
      try {
        // Validate course ID
        if (!mongoose.Types.ObjectId.isValid(courseId)) {
          console.error(`Invalid course ID: ${courseId}`);
          continue;
        }


        console.log(`Processing enrollment for course: ${courseId}`);
        
        // 1. Check if the course exists
        const course = await Course.findById(courseId).session(session);
        if (!course) {
          console.error(`Course not found: ${courseId}`);
          continue; // Skip to next course
        }

        // 2. Check if user is already enrolled
        if (course.studentsEnroled.includes(userId)) {
          console.log(`User ${userId} is already enrolled in course ${courseId}`);
          continue; // Skip to next course
        }

        // 3. Enroll the student in the course
        console.log(`Enrolling user ${userId} in course ${courseId}`);
        const updatedCourse = await Course.findByIdAndUpdate(
          courseId,
          { $addToSet: { studentsEnroled: userId } },
          { new: true, session }
        );

        if (!updatedCourse) {
          throw new Error(`Failed to update course ${courseId}`);
        }

        // 4. Create course progress
        console.log(`Creating course progress for user ${userId} in course ${courseId}`);
        const [courseProgress] = await CourseProgress.create(
          [{
            courseID: courseId,
            userId: userId,
            completedVideos: [],
          }],
          { session }
        );

        // 5. Update user's courses and progress
        console.log(`Updating user ${userId} with course ${courseId} and progress`);
        const updatedUser = await User.findByIdAndUpdate(
          userId,
          {
            $addToSet: {
              courses: courseId,
              courseProgress: courseProgress._id,
            },
          },
          { new: true, session }
        );

        if (!updatedUser) {
          throw new Error(`Failed to update user ${userId} with course ${courseId}`);
        }


        // 6. Send enrollment email
        try {
          console.log(`Sending enrollment email for course ${courseId} to user ${userId}`);
          await mailSender(
            updatedUser.email,
            `Successfully Enrolled into ${course.courseName}`,
            courseEnrollmentEmail(
              course.courseName,
              `${updatedUser.firstName} ${updatedUser.lastName}`
            )
          );
          console.log(`Enrollment email sent for course ${courseId}`);
        } catch (emailError) {
          console.error(`Failed to send enrollment email for course ${courseId}:`, emailError);
          // Don't fail the entire process if email fails
        }
      } catch (courseError) {
        console.error(`Error processing course ${courseId}:`, courseError);
        // Continue with other courses even if one fails
        continue;
      }
    }

    // Don't commit the transaction here - let the caller handle it
    // This ensures we can include all operations in a single transaction
    
    // Get updated user with populated courses
    console.log("Enrollment process completed successfully");
    
    return { 
      success: true
    };
  } catch (error) {
    // If an error occurred, abort the transaction
    console.error("Error in enrollment process:", error);
    if (session?.inTransaction) {
      try {
        console.log("Aborting transaction due to error...");
        await session.abortTransaction();
        console.log("Transaction aborted");
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }
    
    // End the session if we started it
    if (shouldEndSession && session) {
      try {
        await session.endSession();
        console.log("Session ended after error");
      } catch (endSessionError) {
        console.error("Error ending session:", endSessionError);
      }
    }
    
    throw error; // Re-throw to be caught by the caller
  }
};