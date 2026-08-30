-- Reference-only Director 8 instrumentation.
-- This script is inserted only into the reconstructed working DIR. It must
-- never be used to generate expected values from the browser port.

global gReferenceTraceSamples
global gPlanets, gScore, gAlert

on referenceArmNativeTrace
  member("Reference Trace").comments = "native-trace-armed"
end

on referenceEnableNativeTrace
  the traceLogFile = "C:/Reference/Authoring/native-lingo-trace.log"
  the trace = TRUE
end

on referenceDisableNativeTrace
  the trace = FALSE
  the traceLogFile = EMPTY
end

on referenceProbe
  the traceLogFile = "C:/Reference/Authoring/instrumentation-ready.txt"
  put "reference-trace-v1"
  the traceLogFile = EMPTY
end

on startMovie
  if member("Reference Trace").comments = "native-trace-armed" then
    member("Reference Trace").comments = EMPTY
    referenceEnableNativeTrace()
  else
    the traceLogFile = "C:/Reference/Authoring/reference-trace.tsv"
  end if
  put "sample" & TAB & "ticks" & TAB & "movieFrame" & TAB & "phase" & TAB & "state" & TAB & "pointX" & TAB & "pointY" & TAB & "velocityX" & TAB & "velocityY" & TAB & "spriteX" & TAB & "spriteY" & TAB & "stateFrameCount" & TAB & "tries" & TAB & "distance" & TAB & "score" & TAB & "alert"
  gReferenceTraceSamples = 0
end

on prepareFrame
  referenceRecordGPS("prepareFrame")
end

on exitFrame
  referenceRecordGPS("exitFrame")
end

on stopMovie
  the trace = FALSE
  the traceLogFile = EMPTY
end

on referenceGPSInstance
  if sprite(13).memberNum = 0 then
    return VOID
  end if
  tempScriptList = sprite(13).scriptList
  if tempScriptList.count = 0 then
    return VOID
  end if
  tempInstanceList = sprite(13).scriptInstanceList
  repeat with tempIndex = 1 to tempScriptList.count
    if tempScriptList[tempIndex][1].name = "GPS" then
      return tempInstanceList[tempIndex]
    end if
  end repeat
  return VOID
end

on referenceRecordGPS tempPhase
  tempGPS = referenceGPSInstance()
  if voidP(tempGPS) then
    return
  end if

  tempPoint = tempGPS.pPoint
  tempSpritePoint = sprite(13).loc
  put string(gReferenceTraceSamples) & TAB & string(the ticks) & TAB & string(the frame) & TAB & tempPhase & TAB & string(tempGPS.pState) & TAB & string(tempPoint[1]) & TAB & string(tempPoint[2]) & TAB & string(tempGPS.pVX) & TAB & string(tempGPS.pVY) & TAB & string(tempSpritePoint[1]) & TAB & string(tempSpritePoint[2]) & TAB & string(tempGPS.pFrameCount) & TAB & string(tempGPS.pTries) & TAB & string(tempGPS.pDistance) & TAB & string(gScore) & TAB & string(gAlert)
  gReferenceTraceSamples = gReferenceTraceSamples + 1
end
