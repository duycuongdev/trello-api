import { StatusCodes } from 'http-status-codes'
import { columnService } from '~/services/columnService'

const createNew = async (req, res, next) => {

  try {
    const userId = req.jwtDecoded._id
    const createColumn = await columnService.createNew(userId, req.body)
    res.status(StatusCodes.CREATED).json(createColumn)
  } catch (error) { next(error) }
}

const update = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const columnId = req.params.id
    const updatedColumn = await columnService.update(userId, columnId, req.body)

    res.status(StatusCodes.OK).json(updatedColumn)
  } catch (error) { next(error) }
}

const deleteItem = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const columnId = req.params.id
    const result = await columnService.deleteItem(userId, columnId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const archiveColumn = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const columnId = req.params.id
    const result = await columnService.archiveColumn(userId, columnId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const restoreColumn = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const columnId = req.params.id
    const result = await columnService.restoreColumn(userId, columnId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

export const columnController = {
  createNew,
  update,
  deleteItem,
  archiveColumn,
  restoreColumn
}
