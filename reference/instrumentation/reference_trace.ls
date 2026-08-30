-- Reference-only Director 8 instrumentation.
-- This script is inserted only into a writable reconstruction inside Windows
-- Sandbox. It observes Director's values; it never calculates port goldens.

global gReferenceTraceSamples, gReferenceTraceActive, gReferenceTraceLimit
global gReferenceLastState, gReferenceLastBonuses
global gReferenceAutoOperation, gReferenceAutoLaunchKind
global gReferenceAutoA, gReferenceAutoB, gReferenceAutoFrames, gReferenceAutoLevel
global gReferenceRestoreConfig
global gPlanets, gScore, gHighScore, gAlert, gBonus

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
  put "reference-trace-v2"
  the traceLogFile = EMPTY
end

on startMovie
  gReferenceTraceSamples = 0
  gReferenceTraceActive = 0
  gReferenceTraceLimit = 0
  gReferenceLastState = VOID
  gReferenceLastBonuses = EMPTY
  gReferenceAutoOperation = 0
  gReferenceAutoLevel = 0
  tempReferenceConfig = member("Reference Trace").comments
  if member("Reference Trace").comments = "native-trace-armed" then
    member("Reference Trace").comments = EMPTY
    referenceEnableNativeTrace()
  else
    if tempReferenceConfig starts "test-api-" then
      member("Reference Trace").comments = "test-api-running"
      tempOldItemDelimiter = the itemDelimiter
      the itemDelimiter = "|"
      if tempReferenceConfig.item[1] = "test-api-physics" then
        gReferenceAutoOperation = #physics
        gReferenceAutoLaunchKind = symbol(tempReferenceConfig.item[2])
        gReferenceAutoA = float(tempReferenceConfig.item[3])
        gReferenceAutoB = float(tempReferenceConfig.item[4])
        gReferenceAutoFrames = integer(tempReferenceConfig.item[5])
        gReferenceAutoLevel = integer(tempReferenceConfig.item[6])
      else
        if tempReferenceConfig.item[1] = "test-api-state" then
          gReferenceAutoOperation = #state
          gReferenceAutoFrames = integer(tempReferenceConfig.item[2])
          gReferenceAutoLevel = integer(tempReferenceConfig.item[3])
        else
          if tempReferenceConfig.item[1] = "test-api-restore" then
            gReferenceAutoOperation = #restore
            gReferenceRestoreConfig = tempReferenceConfig
            gReferenceAutoLevel = integer(tempReferenceConfig.item[20])
          end if
        end if
      end if
      the itemDelimiter = tempOldItemDelimiter
      if gReferenceAutoLevel > 0 then
        member("fld_level").word[2] = string(gReferenceAutoLevel)
      end if
      the traceLogFile = "C:/Reference/Run/movie-started.txt"
      put "reference-trace-v2"
      the traceLogFile = EMPTY
    end if
  end if
end

on prepareFrame
  tempReferenceStartedCapture = 0
  if gReferenceAutoOperation = #physics then
    if referenceGPSChannel() > 0 then
      gReferenceAutoOperation = 0
      if gReferenceAutoLaunchKind = #vector then
        referenceLaunchVectorAndStart(gReferenceAutoA, gReferenceAutoB, gReferenceAutoFrames)
      else
        referenceLaunchAndStart(gReferenceAutoA, gReferenceAutoB, gReferenceAutoFrames)
      end if
      tempReferenceStartedCapture = 1
    end if
  else
    if gReferenceAutoOperation = #state then
      gReferenceAutoOperation = 0
      referenceStartCapture(gReferenceAutoFrames)
      tempReferenceStartedCapture = 1
    else
      if gReferenceAutoOperation = #restore then
        gReferenceAutoOperation = 0
        referenceApplyRestoreConfig(gReferenceRestoreConfig)
        tempReferenceStartedCapture = 1
      end if
    end if
  end if
  if gReferenceTraceActive and not tempReferenceStartedCapture then
    referenceRecordState("prepareFrame")
  end if
end

on exitFrame
  -- Game_Looping calls go(the frame) before this movie script receives the
  -- event. Native trace evidence therefore defines prepareFrame as the
  -- observable post-GPS boundary for the test API.
end

on stopMovie
  the trace = FALSE
  the traceLogFile = EMPTY
end

on referenceBehaviorInstance tempSpriteNumber, tempBehaviorName
  if sprite(tempSpriteNumber).memberNum = 0 then
    return VOID
  end if
  tempScriptList = sprite(tempSpriteNumber).scriptList
  if tempScriptList.count = 0 then
    return VOID
  end if
  tempInstanceList = sprite(tempSpriteNumber).scriptInstanceList
  repeat with tempIndex = 1 to tempScriptList.count
    if tempScriptList[tempIndex][1].name = tempBehaviorName then
      return tempInstanceList[tempIndex]
    end if
  end repeat
  return VOID
end

on referenceGPSInstance
  repeat with tempSpriteNumber = 1 to 150
    tempGPS = referenceBehaviorInstance(tempSpriteNumber, "GPS")
    if not voidP(tempGPS) then
      return tempGPS
    end if
  end repeat
  return VOID
end

on referenceGPSChannel
  tempGPS = referenceGPSInstance()
  if voidP(tempGPS) then
    return 0
  end if
  return tempGPS.pSprite.spriteNum
end

on referenceExportMovieLabels
  the traceLogFile = "C:/Reference/Run/movie-labels.txt"
  put the labelList
  the traceLogFile = EMPTY
end

on referenceConfirmTarget tempToken
  the traceLogFile = "C:/Reference/Run/command-ready.txt"
  put tempToken & TAB & string(the frame) & TAB & string(the frameLabel) & TAB & member("Reference Trace").comments
  the traceLogFile = EMPTY
end

-- Export the authored Score state at the current frame before playback mutates
-- any sprite.  The web port consumes this as content data; it is not derived
-- from the implementation under test.
on referenceExportScoreFrame tempToken
  the traceLogFile = "C:/Reference/Run/score-" & tempToken & ".tsv"
  put "target" & TAB & "movieFrame" & TAB & "frameLabel" & TAB & "channel" & TAB & "castLibNum" & TAB & "memberNum" & TAB & "memberName" & TAB & "memberType" & TAB & "locH" & TAB & "locV" & TAB & "width" & TAB & "height" & TAB & "rotation" & TAB & "skew" & TAB & "blend" & TAB & "visible" & TAB & "ink" & TAB & "rectLeft" & TAB & "rectTop" & TAB & "rectRight" & TAB & "rectBottom" & TAB & "foreColor" & TAB & "backColor" & TAB & "scriptList"
  repeat with tempChannel = 1 to 150
    if sprite(tempChannel).memberNum <> 0 then
      tempSprite = sprite(tempChannel)
      tempMember = tempSprite.member
      tempRect = tempSprite.rect
      put tempToken & TAB & string(the frame) & TAB & string(the frameLabel) & TAB & string(tempChannel) & TAB & string(tempMember.castLibNum) & TAB & string(tempSprite.memberNum) & TAB & tempMember.name & TAB & string(tempMember.type) & TAB & string(tempSprite.locH) & TAB & string(tempSprite.locV) & TAB & string(tempSprite.width) & TAB & string(tempSprite.height) & TAB & string(tempSprite.rotation) & TAB & string(tempSprite.skew) & TAB & string(tempSprite.blend) & TAB & string(tempSprite.visible) & TAB & string(tempSprite.ink) & TAB & string(tempRect.left) & TAB & string(tempRect.top) & TAB & string(tempRect.right) & TAB & string(tempRect.bottom) & TAB & string(tempSprite.foreColor) & TAB & string(tempSprite.backColor) & TAB & string(tempSprite.scriptList)
    end if
  end repeat
  the traceLogFile = EMPTY
end

on referenceStartCapture tempFrameCount
  gReferenceTraceSamples = 0
  gReferenceTraceLimit = tempFrameCount
  gReferenceTraceActive = 1
  gReferenceLastState = VOID
  gReferenceLastBonuses = EMPTY
  the traceLogFile = "C:/Reference/Run/raw-trace.tsv"
  put "sample" & TAB & "ticks" & TAB & "movieFrame" & TAB & "frameLabel" & TAB & "phase" & TAB & "gpsChannel" & TAB & "state" & TAB & "pointX" & TAB & "pointY" & TAB & "velocityX" & TAB & "velocityY" & TAB & "spriteX" & TAB & "spriteY" & TAB & "stateFrameCount" & TAB & "tries" & TAB & "distance" & TAB & "score" & TAB & "highScore" & TAB & "level" & TAB & "alert" & TAB & "stageInside" & TAB & "flightInside" & TAB & "targetContact" & TAB & "targetX" & TAB & "targetY" & TAB & "planetInfluences" & TAB & "planetContacts" & TAB & "planets" & TAB & "bonuses" & TAB & "event"
  referenceRecordState("initial")
end

on referenceCompleteCapture
  gReferenceTraceActive = 0
  the traceLogFile = "C:/Reference/Run/capture-complete.txt"
  put "reference-trace-v2" & TAB & string(gReferenceTraceSamples)
  the traceLogFile = EMPTY
end

on referenceRecordState tempPhase
  tempGPS = referenceGPSInstance()
  tempGPSChannel = 0
  tempState = VOID
  tempPointX = VOID
  tempPointY = VOID
  tempVelocityX = VOID
  tempVelocityY = VOID
  tempSpriteX = VOID
  tempSpriteY = VOID
  tempFrameCount = VOID
  tempTries = VOID
  tempDistance = VOID
  tempStageInside = VOID
  tempFlightInside = VOID
  tempTargetContact = 0
  tempTargetX = VOID
  tempTargetY = VOID
  tempInfluences = EMPTY
  tempContacts = EMPTY
  tempPlanets = EMPTY
  tempBonuses = EMPTY
  tempEvent = EMPTY

  if not voidP(tempGPS) then
    tempGPSChannel = tempGPS.pSprite.spriteNum
    tempState = tempGPS.pState
    tempPointX = tempGPS.pPoint[1]
    tempPointY = tempGPS.pPoint[2]
    tempVelocityX = tempGPS.pVX
    tempVelocityY = tempGPS.pVY
    tempSpriteX = tempGPS.pSprite.loc[1]
    tempSpriteY = tempGPS.pSprite.loc[2]
    tempFrameCount = tempGPS.pFrameCount
    tempTries = tempGPS.pTries
    tempDistance = tempGPS.pDistance
    tempStageInside = inside(tempGPS.pSprite.loc, tempGPS.pStageRect)
    tempFlightInside = inside(tempGPS.pSprite.loc, tempGPS.pFlightRect)
    if tempState = #hitTarget then
      tempTargetContact = 1
    end if
    tempTargetX = sprite(tempGPS.pTarget).loc[1]
    tempTargetY = sprite(tempGPS.pTarget).loc[2]

    if not voidP(gPlanets) then
      repeat with tempPlanetIndex = 1 to gPlanets.count
        tempPlanetChannel = gPlanets[tempPlanetIndex][1]
        tempPlanetDistance = distance(sprite(tempPlanetChannel).loc - tempGPS.pPoint)
        if tempPlanetIndex > 1 then
          put "|" after tempPlanets
        end if
        tempOrbit = referenceBehaviorInstance(tempPlanetChannel, "Orbiting")
        tempOrbitData = "::::"
        if not voidP(tempOrbit) then
          tempOrbitData = ":" & string(tempOrbit.pVX) & ":" & string(tempOrbit.pVY) & ":" & string(tempOrbit.pFloatLoc[1]) & ":" & string(tempOrbit.pFloatLoc[2])
        end if
        put string(tempPlanetChannel) & ":" & string(sprite(tempPlanetChannel).loc[1]) & ":" & string(sprite(tempPlanetChannel).loc[2]) & ":" & string(gPlanets[tempPlanetIndex][2]) & ":" & string(gPlanets[tempPlanetIndex][3]) & ":" & string(gPlanets[tempPlanetIndex][4]) & tempOrbitData after tempPlanets
        if tempPlanetDistance < gPlanets[tempPlanetIndex][4] then
          if tempInfluences <> EMPTY then
            put "|" after tempInfluences
          end if
          put string(tempPlanetChannel) & ":" & string(tempPlanetDistance) & ":" & string(gPlanets[tempPlanetIndex][4]) after tempInfluences
        end if
        if tempPlanetDistance < gPlanets[tempPlanetIndex][3] then
          if tempContacts <> EMPTY then
            put "|" after tempContacts
          end if
          put string(tempPlanetChannel) & ":" & string(tempPlanetDistance) & ":" & string(gPlanets[tempPlanetIndex][3]) after tempContacts
        end if
      end repeat
    end if
  end if

  if not voidP(gBonus) then
    repeat with tempBonusIndex = 1 to gBonus.count
      tempBonusChannel = gBonus[tempBonusIndex]
      tempBonus = referenceBehaviorInstance(tempBonusChannel, "Bonus")
      if not voidP(tempBonus) then
        if tempBonuses <> EMPTY then
          put "|" after tempBonuses
        end if
        tempBonusOrbit = referenceBehaviorInstance(tempBonusChannel, "Orbiting")
        tempBonusOrbitData = "::::"
        if not voidP(tempBonusOrbit) then
          tempBonusOrbitData = ":" & string(tempBonusOrbit.pVX) & ":" & string(tempBonusOrbit.pVY) & ":" & string(tempBonusOrbit.pFloatLoc[1]) & ":" & string(tempBonusOrbit.pFloatLoc[2])
        end if
        put string(tempBonusChannel) & ":" & string(tempBonus.pState) & ":" & string(tempBonus.pValue) & ":" & string(tempBonus.pSprite.memberNum) & ":" & string(tempBonus.pSprite.rotation) & ":" & string(tempBonus.pRotationVel) & ":" & string(tempBonus.pSprite.loc[1]) & ":" & string(tempBonus.pSprite.loc[2]) & tempBonusOrbitData after tempBonuses
      end if
    end repeat
  end if

  if not voidP(gReferenceLastState) and (tempState <> gReferenceLastState) then
    tempEvent = "state:" & string(gReferenceLastState) & ":" & string(tempState)
  end if
  if (tempContacts <> EMPTY) and (tempState = #crashed) and (gReferenceLastState <> #crashed) then
    tempEvent = "planet:" & tempContacts
  end if
  if (tempTargetContact = 1) and (gReferenceLastState <> #hitTarget) then
    tempEvent = "target"
  end if
  if (tempBonuses <> gReferenceLastBonuses) and (gReferenceLastBonuses <> EMPTY) then
    if tempEvent <> EMPTY then
      put "," after tempEvent
    end if
    put "bonus-change" after tempEvent
  end if

  put string(gReferenceTraceSamples) & TAB & string(the ticks) & TAB & string(the frame) & TAB & string(the frameLabel) & TAB & tempPhase & TAB & string(tempGPSChannel) & TAB & string(tempState) & TAB & string(tempPointX) & TAB & string(tempPointY) & TAB & string(tempVelocityX) & TAB & string(tempVelocityY) & TAB & string(tempSpriteX) & TAB & string(tempSpriteY) & TAB & string(tempFrameCount) & TAB & string(tempTries) & TAB & string(tempDistance) & TAB & string(gScore) & TAB & string(gHighScore) & TAB & string(member("fld_level").word[2]) & TAB & string(gAlert) & TAB & string(tempStageInside) & TAB & string(tempFlightInside) & TAB & string(tempTargetContact) & TAB & string(tempTargetX) & TAB & string(tempTargetY) & TAB & tempInfluences & TAB & tempContacts & TAB & tempPlanets & TAB & tempBonuses & TAB & tempEvent
  gReferenceTraceSamples = gReferenceTraceSamples + 1
  gReferenceLastState = tempState
  gReferenceLastBonuses = tempBonuses

  if gReferenceTraceSamples > gReferenceTraceLimit then
    referenceCompleteCapture()
  end if
end

-- angle is the desired launch direction in Director stage coordinates:
-- 0 degrees points right and 90 degrees points down.
on referenceLaunch tempDistance, tempLaunchAngle
  tempGPS = referenceGPSInstance()
  if voidP(tempGPS) then
    return 0
  end if
  if tempDistance > tempGPS.pStretchLimit then
    tempDistance = tempGPS.pStretchLimit
  end if
  if tempDistance < 10 then
    tempDistance = 10
  end if
  tempPullAngle = tempLaunchAngle + 180.0
  tempGPS.pState = #pullback
  tempGPS.pSHoopT.rotation = tempPullAngle
  tempGPS.pSHoopB.rotation = tempPullAngle
  tempGPS.pPoint = findPoint(tempGPS.pSHoopT.loc, tempPullAngle, tempDistance)
  tempGPS.pSprite.loc = tempGPS.pPoint
  tempGPS.setRubberBands(tempDistance)
  tempGPS.setUpSnapping()
  return 1
end

on referenceLaunchVector tempVX, tempVY
  tempGPS = referenceGPSInstance()
  if voidP(tempGPS) then
    return 0
  end if
  tempSpeed = distance(point(tempVX, tempVY))
  if tempSpeed > 40.0 then
    tempSpeed = 40.0
  end if
  tempNormalizedDistance = sqrt(tempSpeed * 250.0)
  tempPullDistance = tempNormalizedDistance * tempGPS.pStretchLimit / 100.0
  tempLaunchAngle = rotationAngle(point(tempVX, tempVY))
  return referenceLaunch(tempPullDistance, tempLaunchAngle)
end

on referenceLaunchAndStart tempDistance, tempLaunchAngle, tempFrameCount
  tempResult = referenceLaunch(tempDistance, tempLaunchAngle)
  if tempResult then
    referenceStartCapture(tempFrameCount)
  end if
  return tempResult
end

on referenceLaunchVectorAndStart tempVX, tempVY, tempFrameCount
  tempResult = referenceLaunchVector(tempVX, tempVY)
  if tempResult then
    referenceStartCapture(tempFrameCount)
  end if
  return tempResult
end

on referenceSetGameState tempScore, tempHighScore, tempAlert
  gScore = tempScore
  gHighScore = tempHighScore
  gAlert = tempAlert
  member("fld_score").word[2] = string(gScore)
end

on referenceRestoreGPS tempState, tempPointX, tempPointY, tempVelocityX, tempVelocityY, tempFrameCount, tempTries, tempDistance
  tempGPS = referenceGPSInstance()
  if voidP(tempGPS) then
    return 0
  end if
  tempGPS.pState = tempState
  tempGPS.pPoint = point(tempPointX, tempPointY)
  tempGPS.pSprite.loc = tempGPS.pPoint
  tempGPS.pVX = tempVelocityX
  tempGPS.pVY = tempVelocityY
  tempGPS.pFrameCount = tempFrameCount
  tempGPS.pTries = tempTries
  tempGPS.pDistance = tempDistance
  member("fld_tries").word[2] = string(tempTries)
  member("fld_distance").word[2] = string(integer(tempDistance))
  return 1
end

on referenceRestorePlanet tempChannel, tempX, tempY, tempVX, tempVY, tempFloatX, tempFloatY
  sprite(tempChannel).loc = point(tempX, tempY)
  tempOrbit = referenceBehaviorInstance(tempChannel, "Orbiting")
  if not voidP(tempOrbit) then
    tempOrbit.pVX = tempVX
    tempOrbit.pVY = tempVY
    tempOrbit.pFloatLoc = point(tempFloatX, tempFloatY)
  end if
end

on referenceRestoreBonus tempChannel, tempState, tempMemberNum, tempRotation, tempRotationVelocity
  tempBonus = referenceBehaviorInstance(tempChannel, "Bonus")
  if voidP(tempBonus) then
    return 0
  end if
  tempBonus.pState = tempState
  tempBonus.pSprite.member = member(tempMemberNum)
  tempBonus.pSprite.rotation = tempRotation
  tempBonus.pRotationVel = tempRotationVelocity
  return 1
end

on referenceApplyRestoreConfig tempConfig
  tempOldItemDelimiter = the itemDelimiter
  the itemDelimiter = "|"
  tempOperation = tempConfig.item[2]
  tempLaunchKind = tempConfig.item[3]
  tempLaunchA = float(tempConfig.item[4])
  tempLaunchB = float(tempConfig.item[5])
  tempFrames = integer(tempConfig.item[6])
  tempScore = float(tempConfig.item[7])
  tempHighScore = float(tempConfig.item[8])
  tempAlertText = tempConfig.item[9]
  tempGPSState = tempConfig.item[10]
  tempPointX = float(tempConfig.item[11])
  tempPointY = float(tempConfig.item[12])
  tempVelocityX = float(tempConfig.item[13])
  tempVelocityY = float(tempConfig.item[14])
  tempFrameCount = integer(tempConfig.item[15])
  tempTries = integer(tempConfig.item[16])
  tempDistance = float(tempConfig.item[17])
  tempPlanetData = tempConfig.item[18]
  tempBonusData = tempConfig.item[19]

  tempAlert = 0
  if tempAlertText <> "0" then
    tempAlert = symbol(tempAlertText)
  end if
  referenceSetGameState(tempScore, tempHighScore, tempAlert)
  if tempGPSState <> EMPTY then
    referenceRestoreGPS(symbol(tempGPSState), tempPointX, tempPointY, tempVelocityX, tempVelocityY, tempFrameCount, tempTries, tempDistance)
  end if

  if tempPlanetData <> EMPTY then
    the itemDelimiter = ";"
    tempPlanetCount = tempPlanetData.item.count
    repeat with tempPlanetIndex = 1 to tempPlanetCount
      tempPlanetToken = tempPlanetData.item[tempPlanetIndex]
      the itemDelimiter = ","
      referenceRestorePlanet(integer(tempPlanetToken.item[1]), float(tempPlanetToken.item[2]), float(tempPlanetToken.item[3]), float(tempPlanetToken.item[4]), float(tempPlanetToken.item[5]), float(tempPlanetToken.item[6]), float(tempPlanetToken.item[7]))
      the itemDelimiter = ";"
    end repeat
  end if
  if tempBonusData <> EMPTY then
    the itemDelimiter = ";"
    tempBonusCount = tempBonusData.item.count
    repeat with tempBonusIndex = 1 to tempBonusCount
      tempBonusToken = tempBonusData.item[tempBonusIndex]
      the itemDelimiter = ","
      referenceRestoreBonus(integer(tempBonusToken.item[1]), symbol(tempBonusToken.item[2]), integer(tempBonusToken.item[3]), float(tempBonusToken.item[4]), float(tempBonusToken.item[5]))
      the itemDelimiter = ";"
    end repeat
  end if
  the itemDelimiter = tempOldItemDelimiter

  if tempOperation = "physics" then
    if tempLaunchKind = "vector" then
      referenceLaunchVectorAndStart(tempLaunchA, tempLaunchB, tempFrames)
    else
      referenceLaunchAndStart(tempLaunchA, tempLaunchB, tempFrames)
    end if
  else
    referenceStartCapture(tempFrames)
  end if
end
