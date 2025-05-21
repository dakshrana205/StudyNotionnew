const RatingAndReview = require("../models/RatingandReview")
const Course = require("../models/Course")
const mongoose = require("mongoose")

// Create a new rating and review
exports.createRating = async (req, res) => {
  try {
    const userId = req.user.id
    const { rating, review, courseId } = req.body

    // Validate input
    if (!courseId || !rating) {
      return res.status(400).json({
        success: false,
        message: "Course ID and rating are required",
      })
    }

    // Check if the course exists
    const course = await Course.findById(courseId)
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      })
    }

    // Check if the user is enrolled in the course
    const isEnrolled = course.studentsEnroled.includes(userId)
    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: "You must be enrolled in the course to submit a review",
      })
    }

    // Check if the user has already reviewed the course
    const existingReview = await RatingAndReview.findOne({
      user: userId,
      course: courseId,
    })

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this course",
      })
    }


    // Create a new rating and review
    const ratingReview = await RatingAndReview.create({
      rating: Number(rating),
      review: review || "",
      course: courseId,
      user: userId,
    })


    // Add the rating and review to the course
    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      {
        $push: {
          ratingAndReviews: ratingReview._id,
        },
      },
      { new: true }
    )

    if (!updatedCourse) {
      // If course update fails, clean up the created review
      await RatingAndReview.findByIdAndDelete(ratingReview._id)
      throw new Error("Failed to update course with the new review")
    }

    return res.status(201).json({
      success: true,
      message: "Thank you for your review!",
      ratingReview,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
}

// Get the average rating for a course
exports.getAverageRating = async (req, res) => {
  try {
    const courseId = req.body.courseId

    // Calculate the average rating using the MongoDB aggregation pipeline
    const result = await RatingAndReview.aggregate([
      {
        $match: {
          course: new mongoose.Types.ObjectId(courseId), // Convert courseId to ObjectId
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
        },
      },
    ])

    if (result.length > 0) {
      return res.status(200).json({
        success: true,
        averageRating: result[0].averageRating,
      })
    }

    // If no ratings are found, return 0 as the default rating
    return res.status(200).json({ success: true, averageRating: 0 })
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve the rating for the course",
      error: error.message,
    })
  }
}

// Get all rating and reviews
exports.getAllRatingReview = async (req, res) => {
  try {
    const allReviews = await RatingAndReview.find({})
      .sort({ rating: "desc" })
      .populate({
        path: "user",
        select: "firstName lastName email image", // Specify the fields you want to populate from the "Profile" model
      })
      .populate({
        path: "course",
        select: "courseName", //Specify the fields you want to populate from the "Course" model
      })
      .exec()

    res.status(200).json({
      success: true,
      data: allReviews,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve the rating and review for the course",
      error: error.message,
    })
  }
}
