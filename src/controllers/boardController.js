import { StatusCodes } from 'http-status-codes'
import { boardService } from '~/services/boardService'

const createNew = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    // điều hướng sang service
    const createBoard = await boardService.createNew(userId, req.body)

    // có kết quả thì trả về Client
    res.status(StatusCodes.CREATED).json(createBoard)
  } catch (error) { next(error) }
}

const getDetails = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const boardId = req.params.id
    const board = await boardService.getDetails(userId, boardId)

    res.status(StatusCodes.OK).json(board)
  } catch (error) { next(error) }
}

const update = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const boardId = req.params.id
    const boardBackgroundFile = req.file
    const updatedBoard = await boardService.update(userId, boardId, req.body, boardBackgroundFile)

    res.status(StatusCodes.OK).json(updatedBoard)
  } catch (error) { next(error) }
}

const moveCardToDifferentColumn = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const result = await boardService.moveCardToDifferentColumn(userId, req.body)

    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const getBoards = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const { page, itemsPerPage, q: queryFilter, closed } = req.query
    const mergedQueryFilter = {
      ...(typeof queryFilter === 'object' && queryFilter !== null ? queryFilter : {}),
      ...(closed !== undefined ? { closed } : {})
    }
    const results = await boardService.getBoards(userId, page, itemsPerPage, mergedQueryFilter)

    res.status(StatusCodes.OK).json(results)
  } catch (error) { next(error) }
}

const removeMember = async (req, res, next) => {
  try {
    const currentUserId = req.jwtDecoded._id
    const { boardId, userId } = req.params
    const result = await boardService.removeMember(currentUserId, boardId, userId)

    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const getArchivedItems = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const boardId = req.params.id
    const results = await boardService.getArchivedItems(userId, boardId)
    res.status(StatusCodes.OK).json(results)
  } catch (error) { next(error) }
}

const closeBoard = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const boardId = req.params.id
    const result = await boardService.closeBoard(userId, boardId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const reopenBoard = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const boardId = req.params.id
    const result = await boardService.reopenBoard(userId, boardId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const deleteBoard = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const boardId = req.params.id
    const result = await boardService.deleteBoard(userId, boardId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

export const boardController = {
  createNew,
  getDetails,
  update,
  moveCardToDifferentColumn,
  getBoards,
  removeMember,
  getArchivedItems,
  closeBoard,
  reopenBoard,
  deleteBoard
}
