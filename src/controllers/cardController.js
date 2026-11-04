import { StatusCodes } from 'http-status-codes'
import { cardService } from '~/services/cardService'

const createNew = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const createCard = await cardService.createNew(userId, req.body)
    res.status(StatusCodes.CREATED).json(createCard)
  } catch (error) { next(error) }
}

const update = async (req, res, next) => {
  try {
    const cardId = req.params.id
    const cardCoverFile = req.file
    const userInfo = req.jwtDecoded
    const updatedCard = await cardService.update(cardId, req.body, cardCoverFile, userInfo)

    res.status(StatusCodes.OK).json(updatedCard)
  } catch (error) { next(error) }
}

const updateComment = async (req, res, next) => {
  try {
    const { id: cardId, commentId } = req.params
    const { content } = req.body
    const userId = req.jwtDecoded._id
    const updatedCard = await cardService.updateComment(cardId, commentId, content, userId)

    res.status(StatusCodes.OK).json(updatedCard)
  } catch (error) { next(error) }
}

const deleteComment = async (req, res, next) => {
  try {
    const { id: cardId, commentId } = req.params
    const userId = req.jwtDecoded._id
    const updatedCard = await cardService.deleteComment(cardId, commentId, userId)

    res.status(StatusCodes.OK).json(updatedCard)
  } catch (error) { next(error) }
}

const addAttachment = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const cardId = req.params.id
    const file = req.file
    const isChecklistOnly = req.query.isChecklistOnly === 'true'
    const updatedCard = await cardService.addAttachment(userId, cardId, file, isChecklistOnly)
    res.status(StatusCodes.OK).json(updatedCard)
  } catch (error) { next(error) }
}

const deleteAttachment = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const { id: cardId, attachmentId } = req.params
    const updatedCard = await cardService.deleteAttachment(userId, cardId, attachmentId)
    res.status(StatusCodes.OK).json(updatedCard)
  } catch (error) { next(error) }
}

const deleteItem = async (req, res, next) => {
  try {
    const cardId = req.params.id
    const userId = req.jwtDecoded._id
    const result = await cardService.deleteItem(cardId, userId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const copyCard = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const cardId = req.params.id
    const result = await cardService.copyCard(userId, cardId, req.body)
    res.status(StatusCodes.CREATED).json(result)
  } catch (error) { next(error) }
}

const archiveCard = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const cardId = req.params.id
    const result = await cardService.archiveCard(userId, cardId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const restoreCard = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const cardId = req.params.id
    const result = await cardService.restoreCard(userId, cardId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

export const cardController = {
  createNew,
  update,
  updateComment,
  deleteComment,
  addAttachment,
  deleteAttachment,
  deleteItem,
  copyCard,
  archiveCard,
  restoreCard
}
