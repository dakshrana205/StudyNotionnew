import React, { useEffect, useRef, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useNavigate, useParams } from "react-router-dom"

import "video-react/dist/video-react.css"
import { useLocation } from "react-router-dom"
import { BigPlayButton, Player } from "video-react"

import { markLectureAsComplete } from "../../../services/operations/courseDetailsAPI"
import { updateCompletedLectures } from "../../../slices/viewCourseSlice"
import IconBtn from "../../Common/IconBtn"

const VideoDetails = () => {
  const { courseId, sectionId, subSectionId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const playerRef = useRef(null)
  const dispatch = useDispatch()
  const { token } = useSelector((state) => state.auth)
  const { courseSectionData, courseEntireData, completedLectures } =
    useSelector((state) => state.viewCourse)

  const [videoData, setVideoData] = useState([])
  const [previewSource, setPreviewSource] = useState("")
  const [videoEnded, setVideoEnded] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      if (!courseSectionData?.length) return;
      
      if (!courseId || !sectionId || !subSectionId) {
        navigate(`/dashboard/enrolled-courses`);
        return;
      }

      try {
        const filteredData = courseSectionData.filter(
          (course) => course?._id === sectionId
        );

        if (!filteredData.length || !filteredData[0]?.subSection) {
          console.error("No matching section or subsection found");
          return;
        }

        const filteredVideoData = filteredData[0].subSection.filter(
          (data) => data?._id === subSectionId
        );

        if (!filteredVideoData.length) {
          console.error("No matching video data found");
          return;
        }


        setVideoData(filteredVideoData[0]);
        if (courseEntireData?.thumbnail) {
          setPreviewSource(courseEntireData.thumbnail);
        }
        setVideoEnded(false);
      } catch (error) {
        console.error("Error loading video data:", error);
      }
    };

    loadData();
  }, [courseSectionData, courseEntireData, location.pathname, courseId, sectionId, subSectionId, navigate]);

  // check if the lecture is the first video of the course
  const isFirstVideo = () => {
    if (!courseSectionData?.length) return true;
    
    const currentSectionIndx = courseSectionData.findIndex(
      (data) => data?._id === sectionId
    )

    if (currentSectionIndx === -1 || !courseSectionData[currentSectionIndx]?.subSection) {
      return true;
    }

    const currentSubSectionIndx = courseSectionData[
      currentSectionIndx
    ].subSection.findIndex((data) => data?._id === subSectionId)

    return currentSectionIndx === 0 && currentSubSectionIndx === 0;
  }

  // go to the next video
  const goToNextVideo = () => {
    if (!courseSectionData?.length) return;

    const currentSectionIndx = courseSectionData.findIndex(
      (data) => data?._id === sectionId
    )

    if (currentSectionIndx === -1) return;

    const currentSection = courseSectionData[currentSectionIndx];
    if (!currentSection?.subSection?.length) return;

    const noOfSubsections = currentSection.subSection.length;

    const currentSubSectionIndx = currentSection.subSection.findIndex(
      (data) => data?._id === subSectionId
    )

    // If there's a next video in the current section
    if (currentSubSectionIndx !== -1 && currentSubSectionIndx < noOfSubsections - 1) {
      const nextSubSection = currentSection.subSection[currentSubSectionIndx + 1];
      if (nextSubSection?._id) {
        navigate(
          `/view-course/${courseId}/section/${sectionId}/sub-section/${nextSubSection._id}`
        )
      }
      return;
    }
    
    // If we need to go to the next section
    if (currentSectionIndx < courseSectionData.length - 1) {
      const nextSection = courseSectionData[currentSectionIndx + 1];
      if (nextSection?.subSection?.[0]?._id) {
        const nextSectionId = nextSection._id;
        const nextSubSectionId = nextSection.subSection[0]._id;
        navigate(
          `/view-course/${courseId}/section/${nextSectionId}/sub-section/${nextSubSectionId}`
        )
      }
    }
  }

  // check if the lecture is the last video of the course
  const isLastVideo = () => {
    if (!courseSectionData?.length) return true;
    
    const currentSectionIndx = courseSectionData.findIndex(
      (data) => data?._id === sectionId
    )

    if (currentSectionIndx === -1 || !courseSectionData[currentSectionIndx]?.subSection) {
      return true;
    }

    const noOfSubsections = courseSectionData[currentSectionIndx].subSection.length;
    const currentSubSectionIndx = courseSectionData[
      currentSectionIndx
    ].subSection.findIndex((data) => data?._id === subSectionId)

    return (
      currentSectionIndx === courseSectionData.length - 1 &&
      currentSubSectionIndx === noOfSubsections - 1
    )
  }

  // go to the previous video
  const goToPrevVideo = () => {
    // console.log(courseSectionData)

    const currentSectionIndx = courseSectionData.findIndex(
      (data) => data._id === sectionId
    )

    const currentSubSectionIndx = courseSectionData[
      currentSectionIndx
    ].subSection.findIndex((data) => data._id === subSectionId)

    if (currentSubSectionIndx !== 0) {
      const prevSubSectionId =
        courseSectionData[currentSectionIndx].subSection[
          currentSubSectionIndx - 1
        ]._id
      navigate(
        `/view-course/${courseId}/section/${sectionId}/sub-section/${prevSubSectionId}`
      )
    } else {
      const prevSectionId = courseSectionData[currentSectionIndx - 1]._id
      const prevSubSectionLength =
        courseSectionData[currentSectionIndx - 1].subSection.length
      const prevSubSectionId =
        courseSectionData[currentSectionIndx - 1].subSection[
          prevSubSectionLength - 1
        ]._id
      navigate(
        `/view-course/${courseId}/section/${prevSectionId}/sub-section/${prevSubSectionId}`
      )
    }
  }

  const handleLectureCompletion = async () => {
    setLoading(true)
    const res = await markLectureAsComplete(
      { courseId: courseId, subsectionId: subSectionId },
      token
    )
    if (res) {
      dispatch(updateCompletedLectures(subSectionId))
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col gap-5 text-white">
      {!videoData ? (
        <img
          src={previewSource}
          alt="Preview"
          className="h-full w-full rounded-md object-cover"
        />
      ) : (
        <Player
          ref={playerRef}
          aspectRatio="16:9"
          playsInline
          onEnded={() => setVideoEnded(true)}
          src={videoData?.videoUrl}
        >
          <BigPlayButton position="center" />
          {/* Render When Video Ends */}
          {videoEnded && (
            <div
              style={{
                backgroundImage:
                  "linear-gradient(to top, rgb(0, 0, 0), rgba(0,0,0,0.7), rgba(0,0,0,0.5), rgba(0,0,0,0.1)",
              }}
              className="full absolute inset-0 z-[100] grid h-full place-content-center font-inter"
            >
              {!completedLectures.includes(subSectionId) && (
                <IconBtn
                  disabled={loading}
                  onclick={() => handleLectureCompletion()}
                  text={!loading ? "Mark As Completed" : "Loading..."}
                  customClasses="text-xl max-w-max px-4 mx-auto"
                />
              )}
              <IconBtn
                disabled={loading}
                onclick={() => {
                  if (playerRef?.current) {
                    // set the current time of the video to 0
                    playerRef?.current?.seek(0)
                    setVideoEnded(false)
                  }
                }}
                text="Rewatch"
                customClasses="text-xl max-w-max px-4 mx-auto mt-2"
              />
              <div className="mt-10 flex min-w-[250px] justify-center gap-x-4 text-xl">
                {!isFirstVideo() && (
                  <button
                    disabled={loading}
                    onClick={goToPrevVideo}
                    className="blackButton"
                  >
                    Prev
                  </button>
                )}
                {!isLastVideo() && (
                  <button
                    disabled={loading}
                    onClick={goToNextVideo}
                    className="blackButton"
                  >
                    Next
                  </button>
                )}
              </div>
            </div>
          )}
        </Player>
      )}

      <h1 className="mt-4 text-3xl font-semibold">{videoData?.title}</h1>
      <p className="pt-2 pb-6">{videoData?.description}</p>
    </div>
  )
}

export default VideoDetails
// video
