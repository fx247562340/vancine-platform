/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { getImageCapabilities, getImagePlaygroundGroups } from '../api'

export function useImageCapabilities(group: string) {
  const { t } = useTranslation()

  const groupsQuery = useQuery({
    queryKey: ['image-playground-groups'],
    queryFn: getImagePlaygroundGroups,
  })

  const capabilitiesQuery = useQuery({
    queryKey: ['image-playground-capabilities', group],
    queryFn: () => getImageCapabilities(group),
    enabled: group !== '',
  })

  useEffect(() => {
    if (!groupsQuery.isError) return
    toast.error(t('Failed to load playground groups'))
  }, [groupsQuery.isError, t])

  useEffect(() => {
    if (!capabilitiesQuery.isError) return
    toast.error(t('Failed to load image models'))
  }, [capabilitiesQuery.isError, t])

  return {
    groups: groupsQuery.data ?? [],
    models: capabilitiesQuery.data?.models ?? [],
    isLoading: capabilitiesQuery.isLoading || groupsQuery.isLoading,
    isError: capabilitiesQuery.isError || groupsQuery.isError,
    isFetched: capabilitiesQuery.isFetched && !capabilitiesQuery.isError,
  }
}
